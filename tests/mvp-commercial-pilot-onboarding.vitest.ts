import { convexTest } from "convex-test";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { api, internal } from "../src/convex/_generated/api";
import schema from "../src/convex/schema";

const modules = import.meta.glob("../src/convex/**/*.ts");
let t: ReturnType<typeof convexTest<typeof schema>>;
beforeEach(() => { t = convexTest(schema, modules); vi.unstubAllEnvs(); });
afterEach(() => vi.unstubAllEnvs());

async function verified(email: string) {
  const { userId, sessionId } = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { email, emailVerificationTime: Date.now() });
    const sessionId = await ctx.db.insert("authSessions", {
      userId, expirationTime: Date.now() + 3_600_000,
    });
    return { userId, sessionId };
  });
  const issuer = "https://test.convex.site";
  const subject = `${userId}|${sessionId}`;
  return t.withIdentity({
    issuer, subject, tokenIdentifier: `${issuer}|${subject}`, emailVerified: true,
  });
}

test("cadastro comercial exige convite de acesso; convite resgatado cria trial", async () => {
  const owner = await verified("piloto@example.test");
  vi.stubEnv("BARBER_AUTH_COMMERCIAL_ENABLED", "true");
  vi.stubEnv("BARBER_BILLING_ENFORCED", "false");
  const data = { name: "Barbearia Modelo MVP" };
  await expect(owner.mutation(api.orgs.createOrganization, data))
    .rejects.toThrow(/Convite comercial/i);

  const invite = await t.mutation(internal.orgs.issuePilotInvite, {
    email: "piloto@example.test", trialDays: 10,
  });
  expect(invite.code).toMatch(/^[0-9a-f]{64}$/);
  const organizationId = await owner.mutation(api.orgs.createOrganization, {
    ...data, pilotInviteCode: invite.code,
  });
  const saved = await t.run(async ctx => ({
    org: await ctx.db.get(organizationId),
    entitlements: await ctx.db.query("organizationEntitlements")
      .withIndex("by_org", q => q.eq("organizationId", organizationId)).collect(),
    invite: await ctx.db.get(invite.inviteId),
  }));
  expect(saved.org?.name).toBe(data.name);
  expect(saved.entitlements).toHaveLength(1);
  expect(saved.entitlements[0]).toMatchObject({ status: "trialing", source: "pilot", plan: "pilot" });
  expect(saved.invite?.redeemedAt).toBeTypeOf("number");
  await expect(owner.mutation(api.orgs.createOrganization, {
    name: "Tentativa repetida", pilotInviteCode: invite.code,
  })).rejects.toThrow(/Convite comercial inválido/i);
});

test("convite comercial é vinculado ao e-mail verificado do proprietário", async () => {
  const owner = await verified("piloto@example.test");
  const stranger = await verified("outro@example.test");
  vi.stubEnv("BARBER_AUTH_COMMERCIAL_ENABLED", "true");
  const invite = await t.mutation(internal.orgs.issuePilotInvite, {
    email: "piloto@example.test",
  });
  await expect(stranger.mutation(api.orgs.createOrganization, {
    name: "Outra barbearia", pilotInviteCode: invite.code,
  })).rejects.toThrow(/Convite comercial inválido/i);
  expect((await t.run(ctx => ctx.db.get(invite.inviteId)))?.redeemedAt).toBeUndefined();
  const orgId = await owner.mutation(api.orgs.createOrganization, {
    name: "Barbearia Modelo", pilotInviteCode: invite.code,
  });
  expect(orgId).toBeTruthy();
});
