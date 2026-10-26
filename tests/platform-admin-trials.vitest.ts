import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "../src/convex/_generated/api";
import schema from "../src/convex/schema";
import { defaultBusinessHours, defaultSettings } from "../src/convex/orgs";
import type { Id } from "../src/convex/_generated/dataModel";

const modules = import.meta.glob("../src/convex/**/*.ts");
let t: ReturnType<typeof convexTest<typeof schema>>;

beforeEach(() => {
  t = convexTest(schema, modules);
  vi.unstubAllEnvs();
});
afterEach(() => vi.unstubAllEnvs());

async function account(email: string) {
  const { userId, sessionId } = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", {
      email, emailVerificationTime: Date.now(),
    });
    const sessionId = await ctx.db.insert("authSessions", {
      userId, expirationTime: Date.now() + 3600_000,
    });
    return { userId, sessionId };
  });
  const issuer = "https://test.convex.site";
  const subject = `${userId}|${sessionId}`;
  return {
    userId,
    caller: t.withIdentity({
      issuer, subject, tokenIdentifier: `${issuer}|${subject}`, emailVerified: true,
    }),
  };
}

async function makeUnit(ownerId: Id<"users">, isDemo = false) {
  return t.run(ctx => ctx.db.insert("organizations", {
    ownerId, name: isDemo ? "Unidade Demo" : "Unidade Piloto",
    inviteCode: "INVITE-LOCAL-TEST", isDemo,
    businessHours: defaultBusinessHours(), settings: defaultSettings(),
    salesCount: 0, createdAt: Date.now(), updatedAt: Date.now(),
  }));
}

const reason = "Período de avaliação acordado com a unidade piloto.";

function baseArgs(organizationId: Id<"organizations">) {
  return { organizationId, confirmedName: "Unidade Piloto", reason };
}

test("operações não ficam habilitadas sem flag privada e só admin tem acesso", async () => {
  const admin = await account("admin@example.test");
  const outsider = await account("owner@example.test");
  const orgId = await makeUnit(outsider.userId);
  vi.stubEnv("BARBER_PLATFORM_ADMIN_USER_ID", admin.userId);
  vi.stubEnv("BARBER_PLATFORM_ADMIN_EMAIL", "admin@example.test");

  const details = await admin.caller.query(api.platformAdmin.organizationDetails, { organizationId: orgId });
  expect(details.trialManagementEnabled).toBe(false);
  await expect(admin.caller.mutation(api.platformAdmin.managePilotTrial, {
    ...baseArgs(orgId), operation: "start", days: 7,
  })).rejects.toThrow(/desabilitada/i);

  vi.stubEnv("BARBER_PLATFORM_TRIAL_ADMIN_WRITES", "true");
  await expect(outsider.caller.mutation(api.platformAdmin.managePilotTrial, {
    ...baseArgs(orgId), operation: "start", days: 7,
  })).rejects.toThrow(/restrito/i);
  await expect(outsider.caller.query(api.platformAdmin.pilotTrialHistory, {
    organizationId: orgId,
  })).rejects.toThrow(/restrito/i);

  vi.stubEnv("BARBER_BILLING_ENFORCED", "true");
  await expect(admin.caller.mutation(api.platformAdmin.managePilotTrial, {
    ...baseArgs(orgId), operation: "start", days: 7,
  })).rejects.toThrow(/desabilitada/i);
});

test("início, prorrogação, suspensão e reativação preservam origem piloto e gravam histórico", async () => {
  const admin = await account("admin@example.test");
  const owner = await account("owner@example.test");
  const orgId = await makeUnit(owner.userId);
  vi.stubEnv("BARBER_PLATFORM_ADMIN_USER_ID", admin.userId);
  vi.stubEnv("BARBER_PLATFORM_ADMIN_EMAIL", "admin@example.test");
  vi.stubEnv("BARBER_PLATFORM_TRIAL_ADMIN_WRITES", "true");

  const created = await admin.caller.mutation(api.platformAdmin.managePilotTrial, {
    ...baseArgs(orgId), operation: "start", days: 7,
  });
  expect(created.status).toBe("trialing");
  const original = await admin.caller.query(api.platformAdmin.organizationDetails, { organizationId: orgId });
  expect(original.plan).toBe("pilot");
  expect(original.source).toBe("pilot");
  expect(original.entitlementId).toBeTruthy();

  await expect(admin.caller.mutation(api.platformAdmin.managePilotTrial, {
    ...baseArgs(orgId), operation: "extend", days: 2,
    expectedEntitlementId: original.entitlementId!,
    expectedUpdatedAt: original.entitlementUpdatedAt! - 1,
  })).rejects.toThrow(/mudou desde/i);

  const extended = await admin.caller.mutation(api.platformAdmin.managePilotTrial, {
    ...baseArgs(orgId), operation: "extend", days: 2,
    expectedEntitlementId: original.entitlementId!,
    expectedUpdatedAt: original.entitlementUpdatedAt!,
  });
  expect(extended.trialEndsAt).toBeGreaterThan(created.trialEndsAt!);
  const afterExtended = await admin.caller.query(api.platformAdmin.organizationDetails, { organizationId: orgId });
  expect(afterExtended.entitlementUpdatedAt).toBeGreaterThan(original.entitlementUpdatedAt!);

  await admin.caller.mutation(api.platformAdmin.managePilotTrial, {
    ...baseArgs(orgId), operation: "suspend",
    expectedEntitlementId: afterExtended.entitlementId!,
    expectedUpdatedAt: afterExtended.entitlementUpdatedAt!,
  });
  const suspended = await admin.caller.query(api.platformAdmin.organizationDetails, { organizationId: orgId });
  expect(suspended.status).toBe("suspended");

  await admin.caller.mutation(api.platformAdmin.managePilotTrial, {
    ...baseArgs(orgId), operation: "resume", days: 7,
    expectedEntitlementId: suspended.entitlementId!,
    expectedUpdatedAt: suspended.entitlementUpdatedAt!,
  });
  const restored = await admin.caller.query(api.platformAdmin.organizationDetails, { organizationId: orgId });
  expect(restored.status).toBe("trialing");

  const history = await admin.caller.query(api.platformAdmin.pilotTrialHistory, { organizationId: orgId });
  expect(history).toHaveLength(4);
  expect(history.map(event => event.action).sort()).toEqual([
    "pilot_trial_extend", "pilot_trial_resume", "pilot_trial_start", "pilot_trial_suspend",
  ]);
  expect(history.every(event => event.reason === reason)).toBe(true);

  const entitlements = await t.run(ctx => ctx.db.query("organizationEntitlements").collect());
  expect(entitlements).toHaveLength(1);
  expect(entitlements[0].source).toBe("pilot");
});

test("rejeita dados inválidos, demonstração e tentativa de criar teste duplicado", async () => {
  const admin = await account("admin@example.test");
  const orgId = await makeUnit(admin.userId);
  const demoId = await makeUnit(admin.userId, true);
  vi.stubEnv("BARBER_PLATFORM_ADMIN_USER_ID", admin.userId);
  vi.stubEnv("BARBER_PLATFORM_ADMIN_EMAIL", "admin@example.test");
  vi.stubEnv("BARBER_PLATFORM_TRIAL_ADMIN_WRITES", "true");
  const caller = admin.caller;

  await expect(caller.mutation(api.platformAdmin.managePilotTrial, {
    ...baseArgs(orgId), operation: "start", days: 31,
  })).rejects.toThrow(/1 e 30/i);
  await expect(caller.mutation(api.platformAdmin.managePilotTrial, {
    ...baseArgs(orgId), operation: "start", days: 7, confirmedName: "Outra unidade",
  })).rejects.toThrow(/nome completo/i);
  await expect(caller.mutation(api.platformAdmin.managePilotTrial, {
    ...baseArgs(orgId), operation: "start", days: 7, reason: "breve",
  })).rejects.toThrow(/justificativa/i);
  await expect(caller.mutation(api.platformAdmin.managePilotTrial, {
    organizationId: demoId, operation: "start", days: 7,
    confirmedName: "Unidade Demo", reason,
  })).rejects.toThrow(/demonstração/i);

  await caller.mutation(api.platformAdmin.managePilotTrial, {
    ...baseArgs(orgId), operation: "start", days: 7,
  });
  await expect(caller.mutation(api.platformAdmin.managePilotTrial, {
    ...baseArgs(orgId), operation: "start", days: 7,
  })).rejects.toThrow(/mudou desde/i);
});

test("assinaturas de origem billing são intocáveis pelo gerenciamento de pilotos", async () => {
  const admin = await account("admin@example.test");
  const orgId = await makeUnit(admin.userId);
  vi.stubEnv("BARBER_PLATFORM_ADMIN_USER_ID", admin.userId);
  vi.stubEnv("BARBER_PLATFORM_ADMIN_EMAIL", "admin@example.test");
  vi.stubEnv("BARBER_PLATFORM_TRIAL_ADMIN_WRITES", "true");

  const original = await t.run(async ctx => {
    const now = Date.now();
    return await ctx.db.insert("organizationEntitlements", {
      organizationId: orgId, plan: "pro", status: "active",
      source: "billing", periodEndsAt: now + 30 * 86400000,
      createdAt: now, updatedAt: now,
    });
  });
  const before = await t.run(ctx => ctx.db.get(original));
  await expect(admin.caller.mutation(api.platformAdmin.managePilotTrial, {
    ...baseArgs(orgId), operation: "suspend",
    expectedEntitlementId: original, expectedUpdatedAt: before!.updatedAt,
  })).rejects.toThrow(/cobrança/i);
  expect(await t.run(ctx => ctx.db.get(original))).toEqual(before);
});
