import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { HttpError } from "./lib";
import { requirePlatformAdmin } from "./platformAdmin";
import { sandboxLinkingAllowed } from "../lib/asaas-linking-config";

const MAX_REASON = 350;
const MIN_REASON = 12;

function validReason(value: string) {
  const text = value.trim();
  if (text.length < MIN_REASON || text.length > MAX_REASON) {
    throw new HttpError("Justificativa deve conter de 12 a 350 caracteres.");
  }
  return text;
}

/**
 * Admin-only, bounded overview of manual payment associations.
 * This is not a list of paid subscriptions or recognized revenue.
 */
export const links = query({
  args: {},
  handler: async ctx => {
    await requirePlatformAdmin(ctx);
    const records = await ctx.db.query("sandboxBillingLinks")
      .withIndex("by_created").order("desc").take(50);
    const items = await Promise.all(records.map(async link => {
      const org = await ctx.db.get(link.organizationId);
      return {
        id: link._id,
        organizationId: link.organizationId,
        organizationName: org?.name ?? "Unidade indisponível",
        planName: link.planNameSnapshot,
        priceCents: link.priceCentsSnapshot,
        currency: link.currency,
        paymentId: link.paymentId,
        status: link.status,
        createdAt: link.createdAt,
        updatedAt: link.updatedAt,
        reason: link.reason,
        voidReason: link.voidReason ?? null,
      };
    }));
    return { enabled: sandboxLinkingAllowed(), items };
  },
});

/**
 * Manual connection of an existing Asaas Sandbox payment and a plan draft
 * to a barber shop. Every step is admin-authenticated and auditable.
 * This NEVER writes to organizationEntitlements.
 */
export const createLink = mutation({
  args: {
    organizationId: v.id("organizations"),
    planDraftId: v.id("platformPlanDrafts"),
    sourceInboxId: v.id("billingWebhookInbox"),
    expectedPlanUpdatedAt: v.number(),
    confirmedOrganizationName: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    if (!sandboxLinkingAllowed()) throw new HttpError("Vínculos Sandbox desabilitados neste ambiente.");
    const actorId = await getAuthUserId(ctx);
    if (!actorId) throw new HttpError("Sessão administrativa inválida.");
    const org = await ctx.db.get(args.organizationId);
    if (!org || org.isDemo) throw new HttpError("Unidade inexistente ou de demonstração.");
    if (args.confirmedOrganizationName.trim() !== org.name) {
      throw new HttpError("Confirme o nome completo e exato da barbearia.");
    }
    const reason = validReason(args.reason);
    const plan = await ctx.db.get(args.planDraftId);
    if (!plan) throw new HttpError("Rascunho comercial não encontrado.");
    if (plan.updatedAt !== args.expectedPlanUpdatedAt) {
      throw new HttpError("O plano foi alterado. Atualize os dados antes de associar.");
    }
    if (!Number.isSafeInteger(plan.priceCents) || plan.priceCents <= 0 ||
        plan.priceCents > 100000000) {
      throw new HttpError("Escolha um plano com mensalidade positiva válida.");
    }
    const event = await ctx.db.get(args.sourceInboxId);
    if (!event || event.environment !== "sandbox" || event.provider !== "asaas") {
      throw new HttpError("Selecione um evento recebido do Asaas Sandbox.");
    }
    if (event.subscriptionId) {
      throw new HttpError("Cobranças recorrentes serão vinculadas em etapa específica.");
    }

    // Convex mutations are transactional: concurrent attempts conflict and
    // on retry one of them reads the already-associated payment ID.
    const existingLink = await ctx.db.query("sandboxBillingLinks")
      .withIndex("by_payment", q => q.eq("paymentId", event.paymentId)).unique();
    if (existingLink) throw new HttpError("Esta cobrança já foi vinculada. Não é permitido reutilizá-la.");

    const entitlement = await ctx.db.query("organizationEntitlements")
      .withIndex("by_org", q => q.eq("organizationId", org._id)).unique();
    if (entitlement?.source === "billing") {
      throw new HttpError("Esta unidade já possui vínculo comercial operacional.");
    }

    const now = Date.now();
    const id = await ctx.db.insert("sandboxBillingLinks", {
      organizationId: org._id,
      planDraftId: plan._id,
      planNameSnapshot: plan.name,
      priceCentsSnapshot: plan.priceCents,
      currency: "BRL",
      paymentId: event.paymentId,
      sourceInboxId: event._id,
      status: "pending_review",
      reason,
      createdBy: actorId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("platformAdminAuditLogs", {
      actorId,
      action: "sandbox_payment_link_created",
      recordType: "sandboxBillingLinks",
      recordId: id,
      reason,
      createdAt: now,
    });
    return id;
  },
});

/** Marks a wrong draft association invalid without erasing the audit trail. */
export const voidLink = mutation({
  args: {
    linkId: v.id("sandboxBillingLinks"),
    expectedUpdatedAt: v.number(),
    confirmedOrganizationName: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    if (!sandboxLinkingAllowed()) throw new HttpError("Vínculos Sandbox desabilitados neste ambiente.");
    const actorId = await getAuthUserId(ctx);
    if (!actorId) throw new HttpError("Sessão administrativa inválida.");
    const link = await ctx.db.get(args.linkId);
    if (!link) throw new HttpError("Vínculo não encontrado.");
    const org = await ctx.db.get(link.organizationId);
    if (!org || args.confirmedOrganizationName.trim() !== org.name) {
      throw new HttpError("Confirme o nome completo e exato da barbearia.");
    }
    if (link.status !== "pending_review") throw new HttpError("O vínculo já foi invalidado.");
    if (link.updatedAt !== args.expectedUpdatedAt) {
      throw new HttpError("O vínculo foi alterado. Atualize o painel antes de invalidar.");
    }
    const reason = validReason(args.reason);
    const now = Date.now();
    await ctx.db.patch(link._id, {
      status: "voided", voidedBy: actorId, voidedAt: now,
      voidReason: reason, updatedAt: Math.max(now, link.updatedAt + 1),
    });
    await ctx.db.insert("platformAdminAuditLogs", {
      actorId,
      action: "sandbox_payment_link_voided",
      recordType: "sandboxBillingLinks",
      recordId: link._id,
      reason,
      createdAt: now,
    });
    // A voided payment remains permanently reserved to avoid reuse.
    return { voided: true };
  },
});

/** Internal lookup for a strictly read-only sandbox financial check. */
export const linkForReview = internalQuery({
  args: { linkId: v.id("sandboxBillingLinks") },
  handler: async (ctx, { linkId }) => {
    const link = await ctx.db.get(linkId);
    if (!link || link.status !== "pending_review") return null;
    return {
      paymentId: link.paymentId,
      expectedPriceCents: link.priceCentsSnapshot,
      organizationId: link.organizationId,
    };
  },
});
