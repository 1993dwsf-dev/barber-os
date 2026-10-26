import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "../src/convex/_generated/api";
import schema from "../src/convex/schema";
import { matchWebhookSecret, parseAsaasSandboxEvent } from "../src/lib/asaas-sandbox-webhook";

const modules = import.meta.glob("../src/convex/**/*.ts");
let t: ReturnType<typeof convexTest<typeof schema>>;
beforeEach(() => {
  t = convexTest(schema, modules);
  vi.unstubAllEnvs();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const event = {
  eventId: "evt_05b708f961d739ea7eba7e4db318f621",
  eventType: "PAYMENT_RECEIVED",
  paymentId: "pay_080225913252",
};

function enableSandbox() {
  vi.stubEnv("BARBER_ASAAS_WEBHOOK_ENABLED", "true");
  vi.stubEnv("BARBER_ASAAS_ENV", "sandbox");
  vi.stubEnv("CONVEX_CLOUD_URL", "https://unique-tortoise-387.convex.cloud");
  vi.stubEnv("BARBER_BILLING_ENFORCED", "false");
}

async function account(email: string) {
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
  return {
    userId,
    caller: t.withIdentity({
      issuer, subject, tokenIdentifier: `${issuer}|${subject}`, emailVerified: true,
    }),
  };
}

describe("Asaas Sandbox - saneamento de payload", () => {
  test("reconhece evento permitido sem copiar valores, emails ou CPF", () => {
    expect(parseAsaasSandboxEvent({
      id: event.eventId,
      event: "PAYMENT_RECEIVED",
      payment: {
        id: event.paymentId,
        subscription: "sub_012345",
        customer: "cus_98765",
        value: 999,
        billingType: "PIX",
      },
      email: "sensitive@example.test",
      cpfCnpj: "00000000000",
    })).toEqual({
      kind: "recognized",
      value: { ...event, subscriptionId: "sub_012345" },
    });
  });

  test("rejeita identificadores inválidos e ignora eventos não relacionados", () => {
    expect(parseAsaasSandboxEvent({ id: "x", event: "PAYMENT_RECEIVED", payment: { id: "pay_1234" } })).toEqual({ kind: "invalid" });
    expect(parseAsaasSandboxEvent({ id: "evt_test_123", event: "PAYMENT_RECEIVED" })).toEqual({ kind: "invalid" });
    expect(parseAsaasSandboxEvent({ id: "evt_test_123", event: "PAYMENT_CREATED", payment: { id: "=CMD()" } })).toEqual({ kind: "invalid" });
    expect(parseAsaasSandboxEvent({ id: "evt_test_123", event: "TRANSFER_CREATED" })).toEqual({ kind: "ignored" });
  });

  test("token de webhook não aceita valores inválidos", async () => {
    const token = "P5DfBdtfyMPDDPA7ULfs8rQGjpbgWD6YnTtU28q8";
    expect(await matchWebhookSecret(token, token)).toBe(true);
    expect(await matchWebhookSecret("wrong", token)).toBe(false);
    expect(await matchWebhookSecret(null, token)).toBe(false);
    expect(await matchWebhookSecret(token, "123")).toBe(false);
  });
});

describe("inbox transacional, restrita a sandbox", () => {
  test("falha fechado sem flag ou fora do deployment ou quando cobrança está forçada", async () => {
    await expect(t.mutation(internal.platformAdmin.recordAsaasSandboxEvent, event))
      .rejects.toThrow(/desabilitada/i);
    enableSandbox();
    vi.stubEnv("CONVEX_CLOUD_URL", "https://outro-deployment.convex.cloud");
    await expect(t.mutation(internal.platformAdmin.recordAsaasSandboxEvent, event))
      .rejects.toThrow(/desabilitada/i);
    enableSandbox();
    vi.stubEnv("BARBER_BILLING_ENFORCED", "true");
    await expect(t.mutation(internal.platformAdmin.recordAsaasSandboxEvent, event))
      .rejects.toThrow(/desabilitada/i);
  });

  test("registra no máximo uma vez e nunca ativa uma assinatura", async () => {
    enableSandbox();
    const admin = await account("admin@example.test");
    const outsider = await account("outsider@example.test");
    vi.stubEnv("BARBER_PLATFORM_ADMIN_USER_ID", admin.userId);
    vi.stubEnv("BARBER_PLATFORM_ADMIN_EMAIL", "admin@example.test");

    expect(await t.mutation(internal.platformAdmin.recordAsaasSandboxEvent, event))
      .toEqual({ duplicate: false });
    expect(await t.mutation(internal.platformAdmin.recordAsaasSandboxEvent, event))
      .toEqual({ duplicate: true });

    const data = await t.run(async ctx => ({
      events: await ctx.db.query("billingWebhookInbox").collect(),
      entitlements: await ctx.db.query("organizationEntitlements").collect(),
    }));
    expect(data.events).toHaveLength(1);
    expect(data.entitlements).toHaveLength(0);
    expect(data.events[0]).toMatchObject({ ...event, provider: "asaas", environment: "sandbox" });
    expect(JSON.stringify(data)).not.toContain("sensitive@example.test");

    await expect(outsider.caller.query(api.platformAdmin.billingInbox, {})).rejects.toThrow(/restrito/i);
    const inbox = await admin.caller.query(api.platformAdmin.billingInbox, {});
    expect(inbox.enabled).toBe(true);
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0].paymentId).toBe(event.paymentId);
    expect(JSON.stringify(inbox)).not.toContain("organizationId");
  });
});

describe("rota HTTP real do Convex (simulada via convex-test)", () => {
  const path = "/integrations/asaas/webhook";
  const token = "xQYJ_4ftWgYxK7pTmeHLhV9JbZ6fDMZTd5NA7";

  function send(input: unknown, auth: string | null = token) {
    return t.fetch(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(auth === null ? {} : { "asaas-access-token": auth }),
      },
      body: JSON.stringify(input),
    });
  }

  test("rejeita por padrão e quando falta autenticação", async () => {
    const payload = { id: event.eventId, event: event.eventType, payment: { id: event.paymentId } };
    expect((await send(payload)).status).toBe(404);
    enableSandbox();
    vi.stubEnv("BARBER_ASAAS_WEBHOOK_TOKEN", token);
    expect((await send(payload, null)).status).toBe(401);
    expect((await send(payload, "wrong")).status).toBe(401);
    expect(await t.run(ctx => ctx.db.query("billingWebhookInbox").collect())).toHaveLength(0);
  });

  test("registra evento válido, ignora entrega duplicada e rejeita payload incorreto", async () => {
    enableSandbox();
    vi.stubEnv("BARBER_ASAAS_WEBHOOK_TOKEN", token);
    const payload = { id: event.eventId, event: event.eventType, payment: { id: event.paymentId } };
    expect((await send(payload)).status).toBe(200);
    expect((await send(payload)).status).toBe(200);
    expect((await send({ id: "evt_bad", event: "PAYMENT_RECEIVED", payment: {} })).status).toBe(400);
    expect((await send({ id: "evt_unknown", event: "TRANSFER_CREATED" })).status).toBe(200);
    const events = await t.run(ctx => ctx.db.query("billingWebhookInbox").collect());
    expect(events).toHaveLength(1);
    expect(events[0].eventId).toBe(event.eventId);
  });
});


describe("verificação manual de pagamento Sandbox — somente leitura", () => {
  function enableLookup() {
    enableSandbox();
    vi.stubEnv("BARBER_ASAAS_LOOKUP_ENABLED", "true");
    vi.stubEnv("BARBER_ASAAS_API_KEY", "sandbox_example_key_DO_NOT_USE_IN_PRODUCTION_0123456789");
  }

  test("diagnóstico identifica cada bloqueio sem revelar segredo de API", async () => {
    enableLookup();
    const admin = await account("admin@example.test");
    vi.stubEnv("BARBER_PLATFORM_ADMIN_USER_ID", admin.userId);
    vi.stubEnv("BARBER_PLATFORM_ADMIN_EMAIL", "admin@example.test");
    const ready = await admin.caller.query(api.platformAdmin.billingInbox, {});
    expect(ready.lookupEnabled).toBe(true);
    expect(Object.values(ready.lookupChecks).every(Boolean)).toBe(true);
    expect(JSON.stringify(ready)).not.toContain("sandbox_example_key");

    vi.stubEnv("BARBER_ASAAS_LOOKUP_ENABLED", "false");
    const flagMissing = await admin.caller.query(api.platformAdmin.billingInbox, {});
    expect(flagMissing.lookupEnabled).toBe(false);
    expect(flagMissing.lookupChecks.lookupEnabledFlag).toBe(false);
    expect(flagMissing.lookupChecks.apiKeyConfigured).toBe(true);

    vi.stubEnv("BARBER_ASAAS_LOOKUP_ENABLED", "true");
    vi.stubEnv("BARBER_ASAAS_API_KEY", "");
    const keyMissing = await admin.caller.query(api.platformAdmin.billingInbox, {});
    expect(keyMissing.lookupChecks.apiKeyConfigured).toBe(false);
    expect(keyMissing.lookupChecks.apiKeyValidFormat).toBe(false);

    vi.stubEnv("BARBER_ASAAS_API_KEY", "short");
    const invalidKey = await admin.caller.query(api.platformAdmin.billingInbox, {});
    expect(invalidKey.lookupChecks.apiKeyConfigured).toBe(true);
    expect(invalidKey.lookupChecks.apiKeyValidFormat).toBe(false);
    expect(invalidKey.lookupEnabled).toBe(false);

    enableLookup();
    vi.stubEnv("CONVEX_CLOUD_URL", "https://outro-dev.convex.cloud");
    const wrongDeployment = await admin.caller.query(api.platformAdmin.billingInbox, {});
    expect(wrongDeployment.lookupChecks.developmentDeployment).toBe(false);
    expect(wrongDeployment.lookupEnabled).toBe(false);
  });

  test("nega verificação sem flag mesmo quando existe webhook", async () => {
    enableSandbox();
    const admin = await account("admin@example.test");
    vi.stubEnv("BARBER_PLATFORM_ADMIN_USER_ID", admin.userId);
    vi.stubEnv("BARBER_PLATFORM_ADMIN_EMAIL", "admin@example.test");
    await t.mutation(internal.platformAdmin.recordAsaasSandboxEvent, event);
    const inbox = await admin.caller.query(api.platformAdmin.billingInbox, {});
    expect(inbox.lookupEnabled).toBe(false);
    await expect(admin.caller.action(api.billingSandbox.checkPaymentStatus, {
      inboxId: inbox.items[0].id,
    })).rejects.toThrow(/desabilitada/i);
  });

  test("proprietário de barbearia não consulta API externa como admin", async () => {
    enableLookup();
    const admin = await account("admin@example.test");
    const outsider = await account("outsider@example.test");
    vi.stubEnv("BARBER_PLATFORM_ADMIN_USER_ID", admin.userId);
    vi.stubEnv("BARBER_PLATFORM_ADMIN_EMAIL", "admin@example.test");
    await t.mutation(internal.platformAdmin.recordAsaasSandboxEvent, event);
    const inbox = await admin.caller.query(api.platformAdmin.billingInbox, {});
    await expect(outsider.caller.action(api.billingSandbox.checkPaymentStatus, {
      inboxId: inbox.items[0].id,
    })).rejects.toThrow(/restrito/i);
  });

  test("consulta a API por ID recebido, não grava permissões nem dados do cliente", async () => {
    enableLookup();
    const admin = await account("admin@example.test");
    vi.stubEnv("BARBER_PLATFORM_ADMIN_USER_ID", admin.userId);
    vi.stubEnv("BARBER_PLATFORM_ADMIN_EMAIL", "admin@example.test");
    await t.mutation(internal.platformAdmin.recordAsaasSandboxEvent, event);
    const inbox = await admin.caller.query(api.platformAdmin.billingInbox, {});
    expect(inbox.lookupEnabled).toBe(true);
    const mockFetch = vi.fn(async (url: unknown, options: unknown) => {
      expect(url).toBe("https://api-sandbox.asaas.com/v3/payments/pay_080225913252/status");
      expect(options).toBeDefined();
      return new Response(JSON.stringify({ status: "RECEIVED", cpfCnpj: "00000000000" }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await admin.caller.action(api.billingSandbox.checkPaymentStatus, {
      inboxId: inbox.items[0].id,
    });
    expect(result.status).toBe("RECEIVED");
    expect(result.environment).toBe("sandbox");
    expect(JSON.stringify(result)).not.toContain("00000000000");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://api-sandbox.asaas.com/v3/payments/pay_080225913252/status");
    const state = await t.run(async ctx => ({
      entitlements: await ctx.db.query("organizationEntitlements").collect(),
      inbox: await ctx.db.query("billingWebhookInbox").collect(),
    }));
    expect(state.entitlements).toHaveLength(0);
    expect(state.inbox).toHaveLength(1);
  });
});
