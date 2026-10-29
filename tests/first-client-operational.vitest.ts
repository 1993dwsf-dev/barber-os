import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "../src/convex/_generated/api";
import schema from "../src/convex/schema";

const modules = import.meta.glob("../src/convex/**/*.ts");
let t: ReturnType<typeof convexTest<typeof schema>>;
beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("BARBER_AUTH_COMMERCIAL_ENABLED", "true");
  vi.stubEnv("BARBER_BILLING_ENFORCED", "false");
  t = convexTest(schema, modules);
});
afterEach(() => vi.unstubAllEnvs());

async function verified(email: string) {
  const { userId, sessionId } = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", {
      email, emailVerificationTime: Date.now(),
    });
    const sessionId = await ctx.db.insert("authSessions", {
      userId, expirationTime: Date.now() + 3_600_000,
    });
    return { userId, sessionId };
  });
  const issuer = "https://test.convex.site";
  const subject = `${userId}|${sessionId}`;
  return t.withIdentity({ issuer, subject, tokenIdentifier: `${issuer}|${subject}`, emailVerified: true });
}

test("primeiro cliente recebe acesso ativo sem qualquer cobrança integrada", async () => {
  const owner = await verified("proprietario@example.test");
  await expect(owner.mutation(api.orgs.createOrganization, { name: "Barbearia Particular" }))
    .rejects.toThrow(/Convite comercial/i);
  const { code } = await t.mutation(internal.orgs.issueOperationalInvite, {
    email: "proprietario@example.test", accessDays: 365,
  });
  expect(code).toMatch(/^[0-9a-f]{64}$/);
  const organizationId = await owner.mutation(api.orgs.createOrganization, {
    name: "Barbearia Particular", pilotInviteCode: code,
  });
  const result = await t.run(async ctx => {
    const e = await ctx.db.query("organizationEntitlements")
      .withIndex("by_org", q => q.eq("organizationId", organizationId)).unique();
    return { entitlement: e, org: await ctx.db.get(organizationId) };
  });
  expect(result.org?.isDemo).toBe(false);
  expect(result.entitlement?.status).toBe("active");
  expect(result.entitlement?.periodEndsAt).toBeGreaterThan(Date.now() + 360 * 86_400_000);
  expect(result.entitlement?.trialEndsAt).toBeUndefined();
  const status = await owner.query(api.orgs.commercialStatus, { organizationId });
  expect(status.canWrite).toBe(true);
  expect(status.status).toBe("active");
});

test("convite pago não pode ser usado por outro e-mail e só admite uma barbearia", async () => {
  const owner = await verified("dono@example.test");
  const stranger = await verified("estranho@example.test");
  const invite = await t.mutation(internal.orgs.issueOperationalInvite, { email: "dono@example.test" });
  await expect(stranger.mutation(api.orgs.createOrganization, {
    name: "Outra", pilotInviteCode: invite.code,
  })).rejects.toThrow(/Convite comercial inválido/i);
  const id = await owner.mutation(api.orgs.createOrganization, {
    name: "Primeira", pilotInviteCode: invite.code,
  });
  expect(id).toBeTruthy();
  await expect(t.mutation(internal.orgs.issueOperationalInvite, { email: "outra@example.test" }))
    .rejects.toThrow(/já possui uma barbearia/i);
  const second = await t.mutation(internal.orgs.issuePilotInvite, { email: "estranho@example.test" });
  await expect(stranger.mutation(api.orgs.createOrganization, {
    name: "Segunda", pilotInviteCode: second.code,
  })).rejects.toThrow(/já está vinculado à primeira barbearia/i);
});

test("períodos inválidos são recusados; convite de teste original permanece trial", async () => {
  for (const days of [0, 29, 367, 1.5]) {
    await expect(t.mutation(internal.orgs.issueOperationalInvite, {
      email: "dono@example.test", accessDays: days,
    })).rejects.toThrow(/prazo operacional/i);
  }
  const owner = await verified("teste@example.test");
  const invite = await t.mutation(internal.orgs.issuePilotInvite, {
    email: "teste@example.test", trialDays: 14,
  });
  const organizationId = await owner.mutation(api.orgs.createOrganization, {
    name: "Barbearia de teste", pilotInviteCode: invite.code,
  });
  const status = await owner.query(api.orgs.commercialStatus, { organizationId });
  expect(status.status).toBe("trialing");
  expect(status.trialEndsAt).toBeGreaterThan(Date.now());
});
