import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../src/convex/_generated/api";
import schema from "../src/convex/schema";
import { defaultBusinessHours, defaultSettings } from "../src/convex/orgs";
import {
  createSandboxPaymentBody, isAllowedDueDate,
} from "../src/lib/asaas-sandbox-orders";

const modules = import.meta.glob("../src/convex/**/*.ts");
let t: ReturnType<typeof convexTest<typeof schema>>;
beforeEach(() => { t = convexTest(schema, modules); vi.unstubAllEnvs(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function account(email: string) {
  const { userId, sessionId } = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { email, emailVerificationTime: Date.now() });
    const sessionId = await ctx.db.insert("authSessions", {
      userId, expirationTime: Date.now() + 3_600_000,
    });
    return { userId, sessionId };
  });
  const issuer = "https://test.convex.site";
  const sub = `${userId}|${sessionId}`;
  return {
    userId,
    caller: t.withIdentity({
      issuer, subject: sub, tokenIdentifier: `${issuer}|${sub}`, emailVerified: true,
    }),
  };
}

function flags() {
  vi.stubEnv("BARBER_ASAAS_ORDER_WRITES", "true");
  vi.stubEnv("BARBER_ASAAS_LOOKUP_ENABLED", "true");
  vi.stubEnv("BARBER_ASAAS_ENV", "sandbox");
  vi.stubEnv("CONVEX_CLOUD_URL", "https://unique-tortoise-387.convex.cloud");
  vi.stubEnv("BARBER_BILLING_ENFORCED", "false");
  vi.stubEnv("BARBER_ASAAS_API_KEY", "sandbox_example_key_test_only_DO_NOT_USE_1234567890");
}

async function fixtures() {
  const admin = await account("admin@example.test");
  const outsider = await account("stranger@example.test");
  const ids = await t.run(async ctx => {
    const now = Date.now();
    const orgId = await ctx.db.insert("organizations", {
      ownerId: outsider.userId, name: "Barbearia Alfa", isDemo: false,
      inviteCode: "VOUCHER-ISOLADO", businessHours: defaultBusinessHours(),
      settings: defaultSettings(), salesCount: 0, createdAt: now, updatedAt: now,
    });
    const planId = await ctx.db.insert("platformPlanDrafts", {
      name: "Essencial", description: "", priceCents: 5990,
      createdAt: now, updatedAt: now, createdBy: admin.userId, updatedBy: admin.userId,
    });
    return { orgId, planId, version: now };
  });
  vi.stubEnv("BARBER_PLATFORM_ADMIN_USER_ID", admin.userId);
  vi.stubEnv("BARBER_PLATFORM_ADMIN_EMAIL", "admin@example.test");
  const isoDue = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const args = {
    organizationId: ids.orgId, planDraftId: ids.planId,
    customerId: "cus_000000000000", billingType: "PIX" as const,
    dueDate: isoDue, confirmedOrganizationName: "Barbearia Alfa",
    expectedPlanUpdatedAt: ids.version,
    reason: "Pedido fictício para homologar a emissão via API.",
  };
  return { admin, outsider, ids, args };
}

describe("validações puras da emissão Sandbox", () => {
  test("constrói pedido mínimo, sem PII, cartão ou endpoint de produção", () => {
    const spec = {
      externalReference: "barber_sbx_0123456789012",
      customerId: "cus_000000000000",
      priceCents: 5990, billingType: "PIX" as const,
      dueDate: "2026-10-29", planName: "Essencial",
    };
    const body = createSandboxPaymentBody(spec);
    expect(body).toMatchObject({
      customer: spec.customerId, billingType: "PIX", value: 59.9,
      externalReference: spec.externalReference,
    });
    expect(JSON.stringify(body)).not.toContain("cpfCnpj");
    expect(() => createSandboxPaymentBody({ ...spec, priceCents: 59.9 })).toThrow();
    expect(() => createSandboxPaymentBody({ ...spec, customerId: "123" })).toThrow();
    expect(isAllowedDueDate("2026-02-30", Date.UTC(2026, 1, 1))).toBe(false);
    expect(isAllowedDueDate("2026-02-02", Date.UTC(2026, 1, 1))).toBe(true);
  });
});

describe("pedido protegido e emissão única", () => {
  test("nega owner de barbearia, sem flag e não concede entitlement", async () => {
    const { admin, outsider, args } = await fixtures();
    await expect(admin.caller.mutation(api.sandboxOrders.prepareOrder, args))
      .rejects.toThrow(/desabilitada/i);
    flags();
    await expect(outsider.caller.mutation(api.sandboxOrders.prepareOrder, args))
      .rejects.toThrow(/restrito/i);
    const id = await admin.caller.mutation(api.sandboxOrders.prepareOrder, args);
    const list = await admin.caller.query(api.sandboxOrders.orders, {});
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      id, status: "draft", amountCents: 5990, customerId: args.customerId,
    });
    expect(list.items[0].externalReference).toContain("barber_sbx_");
    await expect(admin.caller.mutation(api.sandboxOrders.prepareOrder, args))
      .rejects.toThrow(/pedido aberto/i);
    await expect(outsider.caller.query(api.sandboxOrders.orders, {}))
      .rejects.toThrow(/restrito/i);
    expect(await t.run(ctx => ctx.db.query("organizationEntitlements").collect())).toHaveLength(0);
  });

  test("cria cobrança apenas no host sandbox e com referência interna; nunca emite duas vezes", async () => {
    const { admin, args } = await fixtures();
    flags();
    const id = await admin.caller.mutation(api.sandboxOrders.prepareOrder, args);
    const order = (await admin.caller.query(api.sandboxOrders.orders, {})).items[0];
    let postCount = 0;
    const mock = vi.fn(async (url: unknown, options: unknown) => {
      const uri = String(url);
      if (uri.includes("?externalReference=")) {
        expect(uri).toContain(encodeURIComponent(order.externalReference));
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      expect(uri).toBe("https://api-sandbox.asaas.com/v3/payments");
      const request = options as { method: string; body: string };
      expect(request.method).toBe("POST");
      const body = JSON.parse(request.body);
      expect(body).toMatchObject({
        externalReference: order.externalReference,
        customer: args.customerId,
        billingType: "PIX",
        value: 59.9,
        dueDate: args.dueDate,
      });
      postCount++;
      return new Response(JSON.stringify({
        id: "pay_0123456789", externalReference: order.externalReference,
        customer: args.customerId, billingType: "PIX", value: 59.9,
        dueDate: args.dueDate, subscription: null, installment: null,
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", mock);
    expect(await admin.caller.action(api.sandboxOrders.sendOrder, { orderId: id }))
      .toEqual({ paymentId: "pay_0123456789", status: "created" });
    await expect(admin.caller.action(api.sandboxOrders.sendOrder, { orderId: id }))
      .rejects.toThrow(/enviado/i);
    expect(postCount).toBe(1);
    expect((await admin.caller.query(api.sandboxOrders.orders, {})).items[0].status).toBe("created");
    expect(await t.run(ctx => ctx.db.query("organizationEntitlements").collect())).toHaveLength(0);
  });

  test("timeout deixa estado incerto e recuperação por GET não reenvia POST", async () => {
    const { admin, args } = await fixtures();
    flags();
    const id = await admin.caller.mutation(api.sandboxOrders.prepareOrder, args);
    const order = (await admin.caller.query(api.sandboxOrders.orders, {})).items[0];
    let postCount = 0;
    const postTimeout = vi.fn(async (url: unknown) => {
      if (String(url).includes("?externalReference=")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      postCount++;
      throw new Error("simulated timeout after server may have created payment");
    });
    vi.stubGlobal("fetch", postTimeout);
    await expect(admin.caller.action(api.sandboxOrders.sendOrder, { orderId: id }))
      .rejects.toThrow(/incerto/i);
    expect((await admin.caller.query(api.sandboxOrders.orders, {})).items[0].status).toBe("uncertain");
    await expect(admin.caller.action(api.sandboxOrders.sendOrder, { orderId: id }))
      .rejects.toThrow(/enviado/i);
    expect(postCount).toBe(1);

    const recoveryFetch = vi.fn(async (url: unknown, options: unknown) => {
      expect(String(url)).toContain("?externalReference=");
      expect((options as { method: string }).method).toBe("GET");
      return new Response(JSON.stringify({ data: [{
        id: "pay_0123456789", externalReference: order.externalReference,
        customer: args.customerId, billingType: "PIX", value: 59.9,
        dueDate: args.dueDate,
      }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", recoveryFetch);
    expect(await admin.caller.action(api.sandboxOrders.recoverOrder, { orderId: id }))
      .toEqual({ recovered: true, paymentId: "pay_0123456789" });
    expect((await admin.caller.query(api.sandboxOrders.orders, {})).items[0].status).toBe("created");
    expect(recoveryFetch).toHaveBeenCalledTimes(1);
  });

  test("invalida somente rascunhos e recusa unidade com entitlement comercial", async () => {
    const { admin, args, ids } = await fixtures();
    flags();
    const id = await admin.caller.mutation(api.sandboxOrders.prepareOrder, args);
    await expect(admin.caller.mutation(api.sandboxOrders.voidDraft, {
      orderId: id, confirmedOrganizationName: "Outra",
      reason: "Invalidação controlada de homologação.",
    })).rejects.toThrow(/nome/i);
    await admin.caller.mutation(api.sandboxOrders.voidDraft, {
      orderId: id, confirmedOrganizationName: args.confirmedOrganizationName,
      reason: "Invalidação controlada de homologação.",
    });
    expect((await admin.caller.query(api.sandboxOrders.orders, {})).items[0].status).toBe("voided");
    const now = Date.now();
    await t.run(ctx => ctx.db.insert("organizationEntitlements", {
      organizationId: ids.orgId, plan: "pro", status: "active", source: "billing",
      createdAt: now, updatedAt: now,
    }));
    await expect(admin.caller.mutation(api.sandboxOrders.prepareOrder, args))
      .rejects.toThrow(/entitlement comercial/i);
  });
});
