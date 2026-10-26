import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "../src/convex/_generated/api";
import schema from "../src/convex/schema";
import type { Id } from "../src/convex/_generated/dataModel";
import { defaultBusinessHours, defaultSettings } from "../src/convex/orgs";
import { reviewSandboxPayment } from "../src/lib/asaas-payment-verification";

const modules = import.meta.glob("../src/convex/**/*.ts");
let t: ReturnType<typeof convexTest<typeof schema>>;

beforeEach(() => { t = convexTest(schema, modules); vi.unstubAllEnvs(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

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

function enableSandbox() {
  vi.stubEnv("BARBER_ASAAS_ENV", "sandbox");
  vi.stubEnv("BARBER_ASAAS_LINKING_ENABLED", "true");
  vi.stubEnv("CONVEX_CLOUD_URL", "https://unique-tortoise-387.convex.cloud");
  vi.stubEnv("BARBER_BILLING_ENFORCED", "false");
}

async function createData(ownerId: Id<"users">, opts: { demo?: boolean; amount?: number } = {}) {
  const time = Date.now();
  return t.run(async ctx => {
    const organizationId = await ctx.db.insert("organizations", {
      ownerId, name: opts.demo ? "Unidade Demo" : "Barbearia Alfa", isDemo: !!opts.demo,
      inviteCode: "INVITE-TESTE-LOCAL",
      businessHours: defaultBusinessHours(), settings: defaultSettings(),
      salesCount: 0, createdAt: time, updatedAt: time,
    });
    const planDraftId = await ctx.db.insert("platformPlanDrafts", {
      name: "Essencial", description: "Mensal",
      priceCents: opts.amount ?? 5990, createdBy: ownerId, updatedBy: ownerId,
      createdAt: time, updatedAt: time,
    });
    const sourceInboxId = await ctx.db.insert("billingWebhookInbox", {
      eventId: "evt_123456789", paymentId: "pay_123456789", provider: "asaas",
      environment: "sandbox", eventType: "PAYMENT_CREATED",
      receivedAt: time,
    });
    return { organizationId, planDraftId, sourceInboxId, expectedPlanUpdatedAt: time };
  });
}

test("admin global cria vínculo manual auditável sem ativar acesso ou alterar cobrança", async () => {
  const admin = await account("admin@example.test");
  const stranger = await account("stranger@example.test");
  const ids = await createData(stranger.userId);
  const args = {
    ...ids, confirmedOrganizationName: "Barbearia Alfa",
    reason: "Associação de teste para validar a futura cobrança.",
  };
  vi.stubEnv("BARBER_PLATFORM_ADMIN_USER_ID", admin.userId);
  vi.stubEnv("BARBER_PLATFORM_ADMIN_EMAIL", "admin@example.test");
  await expect(stranger.caller.mutation(api.platformBilling.createLink, args)).rejects.toThrow(/restrito/i);
  await expect(admin.caller.mutation(api.platformBilling.createLink, args)).rejects.toThrow(/desabilitados/i);
  enableSandbox();
  const linkId = await admin.caller.mutation(api.platformBilling.createLink, args);
  const overview = await admin.caller.query(api.platformBilling.links, {});
  expect(overview.enabled).toBe(true);
  expect(overview.items).toHaveLength(1);
  expect(overview.items[0]).toMatchObject({
    id: linkId, organizationId: ids.organizationId,
    planName: "Essencial", priceCents: 5990, status: "pending_review",
  });
  await expect(stranger.caller.query(api.platformBilling.links, {})).rejects.toThrow(/restrito/i);
  const state = await t.run(async ctx => ({
    entitlements: await ctx.db.query("organizationEntitlements").collect(),
    events: await ctx.db.query("billingWebhookInbox").collect(),
    links: await ctx.db.query("sandboxBillingLinks").collect(),
    audit: await ctx.db.query("platformAdminAuditLogs").collect(),
  }));
  expect(state.entitlements).toHaveLength(0);
  expect(state.events).toHaveLength(1);
  expect(state.links).toHaveLength(1);
  expect(state.audit.map(x => x.action)).toEqual(["sandbox_payment_link_created"]);
  await expect(admin.caller.mutation(api.platformBilling.createLink, args))
    .rejects.toThrow(/já foi vinculada/i);
});

test("valida autorização, dados da unidade, versão do plano e bloqueios comerciais", async () => {
  const admin = await account("admin@example.test");
  const ids = await createData(admin.userId);
  vi.stubEnv("BARBER_PLATFORM_ADMIN_USER_ID", admin.userId);
  vi.stubEnv("BARBER_PLATFORM_ADMIN_EMAIL", "admin@example.test");
  enableSandbox();
  const args = {
    ...ids, confirmedOrganizationName: "Barbearia Alfa",
    reason: "Associar manualmente para revisão do pagamento.",
  };
  await expect(admin.caller.mutation(api.platformBilling.createLink, {
    ...args, confirmedOrganizationName: "Outra Unidade",
  })).rejects.toThrow(/nome completo/i);
  await expect(admin.caller.mutation(api.platformBilling.createLink, {
    ...args, reason: "curta",
  })).rejects.toThrow(/Justificativa/i);
  await expect(admin.caller.mutation(api.platformBilling.createLink, {
    ...args, expectedPlanUpdatedAt: ids.expectedPlanUpdatedAt - 1,
  })).rejects.toThrow(/alterado/i);

  vi.stubEnv("BARBER_BILLING_ENFORCED", "true");
  await expect(admin.caller.mutation(api.platformBilling.createLink, args))
    .rejects.toThrow(/desabilitados/i);
  vi.stubEnv("BARBER_BILLING_ENFORCED", "false");

  const demo = await createData(admin.userId, { demo: true });
  await expect(admin.caller.mutation(api.platformBilling.createLink, {
    ...demo, confirmedOrganizationName: "Unidade Demo", reason: args.reason,
  })).rejects.toThrow(/demonstração/i);

  const free = await createData(admin.userId, { amount: 0 });
  await expect(admin.caller.mutation(api.platformBilling.createLink, {
    ...free, confirmedOrganizationName: "Barbearia Alfa", reason: args.reason,
  })).rejects.toThrow(/mensalidade/i);
});

test("preço fica congelado após edição e cobrança não pode pertencer a duas barbearias", async () => {
  const admin = await account("admin@example.test");
  vi.stubEnv("BARBER_PLATFORM_ADMIN_USER_ID", admin.userId);
  vi.stubEnv("BARBER_PLATFORM_ADMIN_EMAIL", "admin@example.test");
  enableSandbox();
  const ids = await createData(admin.userId);
  const reason = "Associação comercial fictícia para conferir imutabilidade.";
  await admin.caller.mutation(api.platformBilling.createLink, {
    ...ids, confirmedOrganizationName: "Barbearia Alfa", reason,
  });

  await t.run(async ctx => {
    await ctx.db.patch(ids.planDraftId, {
      name: "Essencial atualizado", priceCents: 9900, updatedAt: Date.now() + 5000,
    });
  });
  const associations = await admin.caller.query(api.platformBilling.links, {});
  expect(associations.items[0].planName).toBe("Essencial");
  expect(associations.items[0].priceCents).toBe(5990);

  const otherOrgId = await t.run(async ctx => ctx.db.insert("organizations", {
    ownerId: admin.userId, name: "Outra Barbearia", isDemo: false,
    inviteCode: "OUTRO-CONVITE-LOCAL",
    businessHours: defaultBusinessHours(), settings: defaultSettings(),
    salesCount: 0, createdAt: Date.now(), updatedAt: Date.now(),
  }));
  const currentPlan = await t.run(ctx => ctx.db.get(ids.planDraftId));
  await expect(admin.caller.mutation(api.platformBilling.createLink, {
    ...ids, organizationId: otherOrgId,
    expectedPlanUpdatedAt: currentPlan!.updatedAt,
    confirmedOrganizationName: "Outra Barbearia", reason,
  })).rejects.toThrow(/já foi vinculada/i);
  expect((await admin.caller.query(api.platformBilling.links, {})).items).toHaveLength(1);
});

test("não associa pagamentos recorrentes nem unidades com entitlement billing", async () => {
  const admin = await account("admin@example.test");
  vi.stubEnv("BARBER_PLATFORM_ADMIN_USER_ID", admin.userId);
  vi.stubEnv("BARBER_PLATFORM_ADMIN_EMAIL", "admin@example.test");
  enableSandbox();
  const ids = await createData(admin.userId);
  const args = {
    ...ids, confirmedOrganizationName: "Barbearia Alfa",
    reason: "Validação de assinatura recorrente bloqueada.",
  };
  await t.run(ctx => ctx.db.patch(ids.sourceInboxId, { subscriptionId: "sub_test123" }));
  await expect(admin.caller.mutation(api.platformBilling.createLink, args))
    .rejects.toThrow(/recorrentes/i);
  await t.run(async ctx => {
    await ctx.db.patch(ids.sourceInboxId, { subscriptionId: undefined });
    const now = Date.now();
    await ctx.db.insert("organizationEntitlements", {
      organizationId: ids.organizationId,
      plan: "pro", status: "active", source: "billing",
      periodEndsAt: now + 30 * 86_400_000,
      createdAt: now, updatedAt: now,
    });
  });
  await expect(admin.caller.mutation(api.platformBilling.createLink, args))
    .rejects.toThrow(/vínculo comercial operacional/i);
});

test("invalidação exige confirmação, preserva auditoria e impede reutilização de cobrança", async () => {
  const admin = await account("admin@example.test");
  vi.stubEnv("BARBER_PLATFORM_ADMIN_USER_ID", admin.userId);
  vi.stubEnv("BARBER_PLATFORM_ADMIN_EMAIL", "admin@example.test");
  enableSandbox();
  const ids = await createData(admin.userId);
  const args = { ...ids, confirmedOrganizationName: "Barbearia Alfa",
    reason: "Associação autorizada para teste do Sandbox." };
  const linkId = await admin.caller.mutation(api.platformBilling.createLink, args);
  const before = (await admin.caller.query(api.platformBilling.links, {})).items[0];
  await expect(admin.caller.mutation(api.platformBilling.voidLink, {
    linkId, expectedUpdatedAt: before.updatedAt, confirmedOrganizationName: "Outro",
    reason: "Desvinculação de teste autorizada.",
  })).rejects.toThrow(/Confirme/i);
  await expect(admin.caller.mutation(api.platformBilling.voidLink, {
    linkId, expectedUpdatedAt: before.updatedAt - 1,
    confirmedOrganizationName: "Barbearia Alfa", reason: "Desvinculação de teste autorizada.",
  })).rejects.toThrow(/alterado/i);
  await admin.caller.mutation(api.platformBilling.voidLink, {
    linkId, expectedUpdatedAt: before.updatedAt,
    confirmedOrganizationName: "Barbearia Alfa",
    reason: "Invalidação do vínculo de homologação autorizado.",
  });
  const after = await admin.caller.query(api.platformBilling.links, {});
  expect(after.items[0].status).toBe("voided");
  await expect(admin.caller.mutation(api.platformBilling.createLink, args))
    .rejects.toThrow(/já foi vinculada/i);
  const audit = await t.run(ctx => ctx.db.query("platformAdminAuditLogs").collect());
  expect(audit.map(x => x.action)).toEqual([
    "sandbox_payment_link_created", "sandbox_payment_link_voided",
  ]);
});

test("validação de status e valor compara centavos sem confundir titularidade ou acesso", () => {
  expect(reviewSandboxPayment({
    id: "pay_12345", status: "RECEIVED", value: 59.9, customer: "cus_secret",
    billingType: "PIX",
  }, "pay_12345", 5990)).toMatchObject({
    status: "RECEIVED", amountMatches: true, paidStatus: true,
    customerOwnershipVerified: false, eligibleForAutomaticActivation: false,
    accessGranted: false,
  });
  expect(reviewSandboxPayment({
    id: "pay_12345", status: "PENDING", value: 10, billingType: "BOLETO",
  }, "pay_12345", 5990)).toMatchObject({
    paidStatus: false, amountMatches: false, receivedAmountCents: 1000,
  });
  expect(reviewSandboxPayment({
    id: "pay_12345", status: "RECEIVED", value: 59.9,
    billingType: "RECEIVED_IN_CASH",
  }, "pay_12345", 5990).cashRecordedOutsideAsaas).toBe(true);
  expect(() => reviewSandboxPayment({
    id: "pay_bad", status: "RECEIVED", value: 59.9,
  }, "pay_12345", 5990)).toThrow(/não corresponde/i);
  expect(() => reviewSandboxPayment({
    id: "pay_12345", status: "RECEIVED", value: 59.901,
  }, "pay_12345", 5990)).toThrow(/precisão monetária/i);
});

test("action externa só consulta como admin, nunca cria assinatura nem acesso", async () => {
  const admin = await account("admin@example.test");
  const stranger = await account("stranger@example.test");
  vi.stubEnv("BARBER_PLATFORM_ADMIN_USER_ID", admin.userId);
  vi.stubEnv("BARBER_PLATFORM_ADMIN_EMAIL", "admin@example.test");
  enableSandbox();
  const ids = await createData(stranger.userId);
  const linkId = await admin.caller.mutation(api.platformBilling.createLink, {
    ...ids, confirmedOrganizationName: "Barbearia Alfa",
    reason: "Vínculo demonstrativo para verificar valor e status.",
  });
  vi.stubEnv("BARBER_ASAAS_LOOKUP_ENABLED", "true");
  vi.stubEnv("BARBER_ASAAS_API_KEY", "sandbox_example_key_DO_NOT_USE_IN_PRODUCTION_0123456789");

  await expect(stranger.caller.action(api.billingReconciliation.reviewLink, { linkId }))
    .rejects.toThrow(/restrito/i);
  const mockedFetch = vi.fn(async (url: unknown, options: unknown) => {
    expect(url).toBe("https://api-sandbox.asaas.com/v3/payments/pay_123456789");
    expect(options).toBeDefined();
    return new Response(JSON.stringify({
      id: "pay_123456789", status: "RECEIVED", value: 59.9,
      customer: "cus_secret", billingType: "PIX", description: "private",
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", mockedFetch);
  const result = await admin.caller.action(api.billingReconciliation.reviewLink, { linkId });
  expect(result.status).toBe("RECEIVED");
  expect(result.amountMatches).toBe(true);
  expect(result.accessGranted).toBe(false);
  expect(result.eligibleForAutomaticActivation).toBe(false);
  expect(JSON.stringify(result)).not.toContain("cus_secret");
  expect(mockedFetch).toHaveBeenCalledTimes(1);
  const saved = await t.run(async ctx => ({
    entitlements: await ctx.db.query("organizationEntitlements").collect(),
    links: await ctx.db.query("sandboxBillingLinks").collect(),
  }));
  expect(saved.entitlements).toHaveLength(0);
  expect(saved.links).toHaveLength(1);
});
