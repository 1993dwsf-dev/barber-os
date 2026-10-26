import { convexTest } from "convex-test";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { api } from "../src/convex/_generated/api";
import schema from "../src/convex/schema";
import { defaultSettings, defaultBusinessHours } from "../src/convex/orgs";

const modules = import.meta.glob("../src/convex/**/*.ts");
let t: ReturnType<typeof convexTest<typeof schema>>;
beforeEach(() => {
  t = convexTest(schema, modules);
  vi.unstubAllEnvs();
});
afterEach(() => vi.unstubAllEnvs());

async function account(email: string) {
  const { userId, sessionId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email, emailVerificationTime: Date.now(),
    });
    const sessionId = await ctx.db.insert("authSessions", {
      userId, expirationTime: Date.now() + 3600_000,
    });
    return { userId, sessionId };
  });
  const subject = `${userId}|${sessionId}`;
  const issuer = "https://test.convex.site";
  const caller = t.withIdentity({
    issuer, subject, tokenIdentifier: `${issuer}|${subject}`, emailVerified: true,
  });
  return { userId, caller };
}

test("detalhes só para admin e sem dados de clientes, equipe ou contato", async () => {
  const admin = await account("admin@example.test");
  const stranger = await account("outsider@example.test");
  const orgId = await t.run((ctx) => ctx.db.insert("organizations", {
    name: "Barbearia Segura", ownerId: stranger.userId,
    phone: "11111111", email: "privado@example.test", address: "Endereço reservado",
    inviteCode: "NAOEXIBIR", isDemo: false, businessHours: defaultBusinessHours(),
    settings: defaultSettings(), salesCount: 0, createdAt: Date.now(), updatedAt: Date.now(),
  }));

  await expect(stranger.caller.query(api.platformAdmin.organizationDetails, { organizationId: orgId })).rejects.toThrow(/restrito/i);
  vi.stubEnv("BARBER_PLATFORM_ADMIN_USER_ID", admin.userId);
  vi.stubEnv("BARBER_PLATFORM_ADMIN_EMAIL", "admin@example.test");
  await expect(stranger.caller.query(api.platformAdmin.organizationDetails, { organizationId: orgId })).rejects.toThrow(/restrito/i);

  const details = await admin.caller.query(api.platformAdmin.organizationDetails, { organizationId: orgId });
  expect(details.name).toBe("Barbearia Segura");
  expect(details.status).toBe("unconfigured");
  const wire = JSON.stringify(details);
  for (const secret of ["privado@example.test", "11111111", "Endereço reservado", "NAOEXIBIR", "ownerId", "settings"]) {
    expect(wire).not.toContain(secret);
  }
});

test("somente admin cria e edita rascunhos; não altera entitlement", async () => {
  const admin = await account("admin@example.test");
  const stranger = await account("outsider@example.test");
  vi.stubEnv("BARBER_PLATFORM_ADMIN_USER_ID", admin.userId);
  vi.stubEnv("BARBER_PLATFORM_ADMIN_EMAIL", "admin@example.test");

  await expect(stranger.caller.query(api.platformAdmin.planDrafts, {})).rejects.toThrow(/restrito/i);
  await expect(stranger.caller.mutation(api.platformAdmin.savePlanDraft, {
    name: "Pro", description: "Plano", priceCents: 9900,
  })).rejects.toThrow(/restrito/i);

  const id = await admin.caller.mutation(api.platformAdmin.savePlanDraft, {
    name: " Essencial ", description: " Rascunho ", priceCents: 5990,
  });
  let drafts = await admin.caller.query(api.platformAdmin.planDrafts, {});
  expect(drafts).toHaveLength(1);
  expect(drafts[0].name).toBe("Essencial");
  expect(drafts[0].priceCents).toBe(5990);

  await admin.caller.mutation(api.platformAdmin.savePlanDraft, {
    id, name: "Pro", description: "Alterado", priceCents: 9990,
  });
  drafts = await admin.caller.query(api.platformAdmin.planDrafts, {});
  expect(drafts).toHaveLength(1);
  expect(drafts[0].name).toBe("Pro");

  const state = await t.run(async (ctx) => ({
    entitlements: await ctx.db.query("organizationEntitlements").collect(),
    logs: await ctx.db.query("platformAdminAuditLogs").collect(),
  }));
  expect(state.entitlements).toHaveLength(0);
  expect(state.logs.map(x => x.action)).toEqual(["plan_draft_created", "plan_draft_updated"]);
});

test("valida preço e tamanho dos rascunhos no servidor", async () => {
  const admin = await account("admin@example.test");
  vi.stubEnv("BARBER_PLATFORM_ADMIN_USER_ID", admin.userId);
  vi.stubEnv("BARBER_PLATFORM_ADMIN_EMAIL", "admin@example.test");
  await expect(admin.caller.mutation(api.platformAdmin.savePlanDraft, {
    name: "Pro", description: "", priceCents: -100,
  })).rejects.toThrow(/mensalidade/i);
  await expect(admin.caller.mutation(api.platformAdmin.savePlanDraft, {
    name: "Pro", description: "", priceCents: 99.99,
  })).rejects.toThrow(/mensalidade/i);
  await expect(admin.caller.mutation(api.platformAdmin.savePlanDraft, {
    name: " ", description: "", priceCents: 1000,
  })).rejects.toThrow(/nome/i);
});
