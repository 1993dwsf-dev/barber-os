import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { HttpError } from "./lib";
import { requirePlatformAdmin } from "./platformAdmin";
import type { Id } from "./_generated/dataModel";
import {
  SANDBOX_ASAAS_GATEWAY, createSandboxPaymentBody, isAllowedDueDate,
  parseAsaasReferenceMatches, sandboxOrderIssueEnabled, validCustomerId,
  verifyIssuedSandboxPayment,
} from "../lib/asaas-sandbox-orders";
import type { SandboxOrderSpec } from "../lib/asaas-sandbox-orders";

/**
 * Safe staged Sandbox billing issuance:
 * draft -> sending -> created | uncertain.
 * Never retries an ambiguous POST. Recovery only reads by externalReference.
 * Nothing in this module touches organizationEntitlements.
 */

export const orders = query({
  args: {},
  handler: async ctx => {
    await requirePlatformAdmin(ctx);
    const docs = await ctx.db.query("sandboxBillingOrders")
      .withIndex("by_created").order("desc").take(50);
    return {
      enabled: sandboxOrderIssueEnabled(),
      items: await Promise.all(docs.map(async item => ({
        id: item._id,
        organizationId: item.organizationId,
        organizationName: (await ctx.db.get(item.organizationId))?.name ?? "Unidade indisponível",
        planName: item.planNameSnapshot,
        amountCents: item.priceCentsSnapshot,
        customerId: item.customerId,
        dueDate: item.dueDate,
        billingType: item.billingType,
        externalReference: item.externalReference,
        paymentId: item.paymentId ?? null,
        status: item.status,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }))),
    };
  },
});

export const prepareOrder = mutation({
  args: {
    organizationId: v.id("organizations"),
    planDraftId: v.id("platformPlanDrafts"),
    customerId: v.string(),
    billingType: v.union(v.literal("PIX"), v.literal("BOLETO")),
    dueDate: v.string(),
    confirmedOrganizationName: v.string(),
    expectedPlanUpdatedAt: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    if (!sandboxOrderIssueEnabled()) throw new HttpError("Emissão Sandbox desabilitada.");
    const actorId = await getAuthUserId(ctx);
    if (!actorId) throw new HttpError("Sessão administrativa inválida.");
    const org = await ctx.db.get(args.organizationId);
    if (!org || org.isDemo || org.name !== args.confirmedOrganizationName.trim()) {
      throw new HttpError("Unidade inexistente, demo ou confirmação do nome incorreta.");
    }
    const entitlement = await ctx.db.query("organizationEntitlements")
      .withIndex("by_org", q => q.eq("organizationId", org._id)).unique();
    if (entitlement?.source === "billing") {
      throw new HttpError("Unidade com entitlement comercial existente.");
    }
    const plan = await ctx.db.get(args.planDraftId);
    if (!plan || plan.updatedAt !== args.expectedPlanUpdatedAt ||
        !Number.isSafeInteger(plan.priceCents) || plan.priceCents <= 0 ||
        plan.priceCents > 100000000) {
      throw new HttpError("Plano alterado ou preço inválido.");
    }
    if (!validCustomerId(args.customerId)) {
      throw new HttpError("Identificador do cliente Asaas Sandbox inválido.");
    }
    if (!isAllowedDueDate(args.dueDate, Date.now())) {
      throw new HttpError("Vencimento deve ficar entre hoje e 45 dias a partir de hoje.");
    }
    const reason = args.reason.trim();
    if (reason.length < 12 || reason.length > 350) {
      throw new HttpError("Justificativa deve ter de 12 a 350 caracteres.");
    }
    const active = await ctx.db.query("sandboxBillingOrders")
      .withIndex("by_org", q => q.eq("organizationId", org._id)).take(50);
    if (active.some(x => x.status === "draft" || x.status === "sending" || x.status === "uncertain")) {
      throw new HttpError("Já existe pedido aberto ou de resultado incerto nesta barbearia.");
    }
    const now = Date.now();
    const id = await ctx.db.insert("sandboxBillingOrders", {
      organizationId: org._id,
      planDraftId: plan._id,
      planNameSnapshot: plan.name,
      priceCentsSnapshot: plan.priceCents,
      customerId: args.customerId,
      billingType: args.billingType,
      dueDate: args.dueDate,
      externalReference: "", // immediately patched atomically in this mutation
      status: "draft",
      reason,
      createdBy: actorId,
      createdAt: now, updatedAt: now,
    });
    await ctx.db.patch(id, { externalReference: `barber_sbx_${id}` });
    await ctx.db.insert("platformAdminAuditLogs", {
      actorId, action: "sandbox_order_prepared", recordType: "sandboxBillingOrders",
      recordId: id, reason, createdAt: now,
    });
    return id;
  },
});

export const voidDraft = mutation({
  args: {
    orderId: v.id("sandboxBillingOrders"),
    confirmedOrganizationName: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    if (!sandboxOrderIssueEnabled()) throw new HttpError("Emissão Sandbox desabilitada.");
    const actorId = await getAuthUserId(ctx);
    if (!actorId) throw new HttpError("Sessão inválida.");
    const order = await ctx.db.get(args.orderId);
    if (!order || order.status !== "draft") {
      throw new HttpError("Somente pedidos ainda não enviados podem ser invalidados.");
    }
    const org = await ctx.db.get(order.organizationId);
    if (!org || org.name !== args.confirmedOrganizationName.trim()) {
      throw new HttpError("Confirme o nome exato da barbearia.");
    }
    const reason = args.reason.trim();
    if (reason.length < 12 || reason.length > 350) {
      throw new HttpError("Informe uma justificativa de 12 a 350 caracteres.");
    }
    const now = Date.now();
    await ctx.db.patch(order._id, { status: "voided", voidedAt: now, updatedAt: now });
    await ctx.db.insert("platformAdminAuditLogs", {
      actorId, action: "sandbox_order_draft_voided", recordType: "sandboxBillingOrders",
      recordId: order._id, reason, createdAt: now,
    });
    return { voided: true };
  },
});

export const reserveSending = internalMutation({
  args: { orderId: v.id("sandboxBillingOrders") },
  handler: async (ctx, { orderId }): Promise<SandboxOrderSpec> => {
    if (!sandboxOrderIssueEnabled()) throw new HttpError("Emissão Sandbox desabilitada.");
    const order = await ctx.db.get(orderId);
    if (!order || order.status !== "draft") {
      throw new HttpError("Pedido indisponível ou já enviado para processamento.");
    }
    if (!isAllowedDueDate(order.dueDate, Date.now())) {
      throw new HttpError("Vencimento do pedido expirado. Invalide e crie outro.");
    }
    const now = Date.now();
    await ctx.db.patch(orderId, { status: "sending", attemptStartedAt: now, updatedAt: now });
    return {
      customerId: order.customerId, externalReference: order.externalReference,
      billingType: order.billingType, dueDate: order.dueDate,
      priceCents: order.priceCentsSnapshot, planName: order.planNameSnapshot,
    };
  },
});

export const recoverSpec = query({
  args: { orderId: v.id("sandboxBillingOrders") },
  handler: async (ctx, { orderId }) => {
    await requirePlatformAdmin(ctx);
    if (!sandboxOrderIssueEnabled()) throw new HttpError("Emissão Sandbox desabilitada.");
    const order = await ctx.db.get(orderId);
    if (!order || (order.status !== "uncertain" && order.status !== "sending")) {
      throw new HttpError("Apenas pedidos de envio incerto podem ser recuperados.");
    }
    return {
      customerId: order.customerId, externalReference: order.externalReference,
      billingType: order.billingType, dueDate: order.dueDate,
      priceCents: order.priceCentsSnapshot, planName: order.planNameSnapshot,
    };
  },
});

export const recordUncertain = internalMutation({
  args: { orderId: v.id("sandboxBillingOrders") },
  handler: async (ctx, { orderId }) => {
    const order = await ctx.db.get(orderId);
    if (order?.status === "sending") {
      await ctx.db.patch(orderId, { status: "uncertain", updatedAt: Date.now() });
    }
    return { uncertain: true };
  },
});

export const finalizeCreated = internalMutation({
  args: { orderId: v.id("sandboxBillingOrders"), paymentId: v.string() },
  handler: async (ctx, { orderId, paymentId }) => {
    if (!sandboxOrderIssueEnabled()) throw new HttpError("Emissão Sandbox desabilitada.");
    const order = await ctx.db.get(orderId);
    if (!order || (order.status !== "sending" && order.status !== "uncertain")) {
      throw new HttpError("Pedido fora do estágio de confirmação.");
    }
    const already = await ctx.db.query("sandboxBillingOrders")
      .withIndex("by_payment", q => q.eq("paymentId", paymentId)).unique();
    if (already && already._id !== orderId) {
      throw new HttpError("ID de cobrança já atribuído a outro pedido.");
    }
    const existingManual = await ctx.db.query("sandboxBillingLinks")
      .withIndex("by_payment", q => q.eq("paymentId", paymentId)).unique();
    if (existingManual && existingManual.organizationId !== order.organizationId) {
      throw new HttpError("Conflito com vínculo manual de outra barbearia.");
    }
    const now = Date.now();
    await ctx.db.patch(orderId, {
      paymentId, status: "created", updatedAt: now,
    });
    await ctx.db.insert("platformAdminAuditLogs", {
      actorId: order.createdBy, action: "sandbox_order_payment_created",
      recordType: "sandboxBillingOrders", recordId: orderId, createdAt: now,
    });
    return { paymentId, status: "created" as const };
  },
});

/** The only network caller: fixed Asaas Sandbox host, POST once at most. */
export const sendOrder = action({
  args: { orderId: v.id("sandboxBillingOrders") },
  handler: async (ctx, { orderId }): Promise<{ paymentId: string; status: "created" }> => {
    const allowed: boolean = await ctx.runQuery(api.platformAdmin.access, {});
    if (!allowed || !sandboxOrderIssueEnabled()) throw new HttpError("Emissão Sandbox não autorizada.");
    const apiKey = process.env.BARBER_ASAAS_API_KEY?.trim();
    if (!apiKey || apiKey.length < 20 || /\s/.test(apiKey)) {
      throw new HttpError("Chave privada Asaas Sandbox indisponível.");
    }
    const spec: SandboxOrderSpec = await ctx.runMutation(internal.sandboxOrders.reserveSending, { orderId });
    try {
      const lookup = await fetch(
        `${SANDBOX_ASAAS_GATEWAY}/v3/payments?externalReference=${encodeURIComponent(spec.externalReference)}&limit=2`,
        {
          method: "GET",
          headers: { access_token: apiKey, accept: "application/json", "User-Agent": "BarberOS-Sandbox/0.2" },
          signal: AbortSignal.timeout(8_000), cache: "no-store",
        },
      );
      if (!lookup.ok) throw new Error("Falha ao verificar referência antes da emissão.");
      const matches = parseAsaasReferenceMatches(await lookup.json());
      if (matches.length !== 0) {
        // If a previous attempt created this payment, do not issue another one.
        // Leave uncertain so the explicit recovery operation can validate it.
        throw new Error("Cobrança já existente no Asaas para esta referência.");
      }
      const request = createSandboxPaymentBody(spec);
      const created = await fetch(`${SANDBOX_ASAAS_GATEWAY}/v3/payments`, {
        method: "POST",
        headers: {
          access_token: apiKey, accept: "application/json",
          "content-type": "application/json", "User-Agent": "BarberOS-Sandbox/0.2",
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      if (!created.ok) throw new Error("Asaas Sandbox não confirmou a emissão.");
      const paymentId = verifyIssuedSandboxPayment(await created.json(), spec);
      return await ctx.runMutation(internal.sandboxOrders.finalizeCreated, { orderId, paymentId });
    } catch {
      // Never retry POST automatically. An inconclusive response may have
      // succeeded remotely; only a GET by reference can resolve it.
      await ctx.runMutation(internal.sandboxOrders.recordUncertain, { orderId });
      throw new HttpError(
        "Resultado incerto. Nenhuma nova cobrança será enviada; use recuperação por referência.",
      );
    }
  },
});

/** Recovery is GET-only. NEVER repeats the POST after ambiguous failure. */
export const recoverOrder = action({
  args: { orderId: v.id("sandboxBillingOrders") },
  handler: async (ctx, { orderId }): Promise<{
    recovered: boolean; paymentId: string | null;
  }> => {
    const allowed: boolean = await ctx.runQuery(api.platformAdmin.access, {});
    if (!allowed || !sandboxOrderIssueEnabled()) throw new HttpError("Recuperação Sandbox não autorizada.");
    const apiKey = process.env.BARBER_ASAAS_API_KEY?.trim();
    if (!apiKey || apiKey.length < 20 || /\s/.test(apiKey)) {
      throw new HttpError("Chave privada do Sandbox ausente.");
    }
    const spec: SandboxOrderSpec = await ctx.runQuery(api.sandboxOrders.recoverSpec, { orderId });
    let entries: unknown[];
    try {
      const res = await fetch(
        `${SANDBOX_ASAAS_GATEWAY}/v3/payments?externalReference=${encodeURIComponent(spec.externalReference)}&limit=2`,
        {
          method: "GET",
          headers: { access_token: apiKey, accept: "application/json", "User-Agent": "BarberOS-Sandbox/0.2" },
          signal: AbortSignal.timeout(8_000), cache: "no-store",
        },
      );
      if (!res.ok) throw new Error("Falha ao consultar referência.");
      entries = parseAsaasReferenceMatches(await res.json());
    } catch {
      throw new HttpError("Não foi possível consultar o Asaas Sandbox; mantenha o pedido em revisão.");
    }
    if (entries.length === 0) {
      await ctx.runMutation(internal.sandboxOrders.recordUncertain, { orderId });
      return { recovered: false, paymentId: null };
    }
    if (entries.length !== 1) {
      throw new HttpError("Foram encontradas várias cobranças; exige revisão manual.");
    }
    let paymentId: string;
    try {
      paymentId = verifyIssuedSandboxPayment(entries[0], spec);
    } catch {
      throw new HttpError("A cobrança encontrada não corresponde ao pedido original.");
    }
    const result: { paymentId: string } =
      await ctx.runMutation(internal.sandboxOrders.finalizeCreated, { orderId, paymentId });
    return { recovered: true, paymentId: result.paymentId };
  },
});
