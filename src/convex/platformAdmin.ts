import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { HttpError } from "./lib";

/**
 * Administração da plataforma (não da barbearia).
 *
 * O acesso depende de duas variáveis privadas do deployment Convex, jamais do
 * frontend, do papel "owner" de uma barbearia ou de um parâmetro enviado por cliente.
 * Por padrão, sem as DUAS variáveis configuradas, ninguém tem acesso.
 */
async function isPlatformAdmin(ctx: QueryCtx | MutationCtx): Promise<boolean> {
  const allowedId = process.env.BARBER_PLATFORM_ADMIN_USER_ID?.trim();
  const allowedEmail = process.env.BARBER_PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  if (!allowedId || !allowedEmail) return false;
  const userId = await getAuthUserId(ctx);
  if (!userId || userId !== allowedId) return false;
  const user = await ctx.db.get(userId);
  if (!user || user.isAnonymous === true || !user.emailVerificationTime) return false;
  return user.email?.trim().toLowerCase() === allowedEmail;
}

async function requirePlatformAdmin(ctx: QueryCtx | MutationCtx): Promise<void> {
  if (!(await isPlatformAdmin(ctx))) {
    throw new HttpError("Acesso restrito à administração da plataforma.");
  }
}

/** A interface usa apenas o resultado booleano; não revela dados de configuração. */
export const access = query({
  args: {},
  handler: async (ctx) => isPlatformAdmin(ctx),
});

/** 
 * Visão geral limitada e de SOMENTE LEITURA.
 * Não retorna informações de clientes, equipe, telefones, e-mails, vendas,
 * valores financeiros de uma unidade, convites ou credenciais.
 * O corte é explícito: contadores representam apenas as unidades exibidas.
 */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requirePlatformAdmin(ctx);
    const max = 75;
    const slice = await ctx.db.query("organizations").order("desc").take(max + 1);
    const page = slice.slice(0, max);
    const now = Date.now();
    const organizations = await Promise.all(page.map(async (org) => {
      const entitlement = await ctx.db
        .query("organizationEntitlements")
        .withIndex("by_org", q => q.eq("organizationId", org._id))
        .unique();
      const status = entitlement?.status ?? "unconfigured";
      return {
        id: org._id,
        name: org.name,
        createdAt: org.createdAt,
        isDemo: org.isDemo,
        plan: entitlement?.plan ?? null,
        status,
        trialEndsAt: entitlement?.trialEndsAt ?? null,
        periodEndsAt: entitlement?.periodEndsAt ?? null,
        // Não inferir que 'active' no schema significa assinante pagante:
        // a cobrança comercial não está conectada.
      };
    }));
    return {
      generatedAt: now,
      hasMore: slice.length > max,
      maxRows: max,
      summary: {
        organizationsShown: organizations.length,
        demoShown: organizations.filter(o => o.isDemo).length,
        unitsWithoutEntitlement: organizations.filter(o => o.status === "unconfigured").length,
        trialsShown: organizations.filter(o => o.status === "trialing").length,
      },
      organizations,
    };
  },
});

/** Dados operacionais da unidade, sem cadastros de clientes ou funcionários. */
function pilotTrialWritesEnabled(): boolean {
  return process.env.BARBER_PLATFORM_TRIAL_ADMIN_WRITES === "true" &&
    process.env.BARBER_BILLING_ENFORCED !== "true";
}

export const organizationDetails = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requirePlatformAdmin(ctx);
    const org = await ctx.db.get(organizationId);
    if (!org) throw new HttpError("Unidade não encontrada.");
    const entitlement = await ctx.db
      .query("organizationEntitlements")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .unique();
    return {
      id: org._id,
      name: org.name,
      isDemo: org.isDemo,
      onboardingStep: org.onboardingStep ?? null,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
      plan: entitlement?.plan ?? null,
      status: entitlement?.status ?? "unconfigured",
      trialEndsAt: entitlement?.trialEndsAt ?? null,
      periodEndsAt: entitlement?.periodEndsAt ?? null,
      graceEndsAt: entitlement?.graceEndsAt ?? null,
      source: entitlement?.source ?? null,
      entitlementId: entitlement?._id ?? null,
      entitlementUpdatedAt: entitlement?.updatedAt ?? null,
      trialManagementEnabled: pilotTrialWritesEnabled(),
      commercialAccessEnforced: process.env.BARBER_AUTH_COMMERCIAL_ENABLED === "true" ||
        process.env.BARBER_BILLING_ENFORCED === "true",
    };
  },
});

/** Catálogo comercial de rascunhos, independente de assinaturas operacionais. */
export const planDrafts = query({
  args: {},
  handler: async (ctx) => {
    await requirePlatformAdmin(ctx);
    return await ctx.db.query("platformPlanDrafts")
      .withIndex("by_updated").order("desc").take(100);
  },
});

/**
 * Salva um rascunho. Não chama o provedor de cobrança e não altera o direito
 * de acesso de nenhuma barbearia.
 */
export const savePlanDraft = mutation({
  args: {
    id: v.optional(v.id("platformPlanDrafts")),
    name: v.string(),
    description: v.string(),
    priceCents: v.number(),
  },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    const actorId = await getAuthUserId(ctx);
    if (!actorId) throw new HttpError("Sessão inválida.");

    const name = args.name.trim();
    const description = args.description.trim();
    if (!name || name.length > 100) throw new HttpError("Nome deve ter de 1 a 100 caracteres.");
    if (description.length > 1000) throw new HttpError("Descrição excede 1000 caracteres.");
    if (!Number.isSafeInteger(args.priceCents) || args.priceCents < 0 || args.priceCents > 100000000) {
      throw new HttpError("Mensalidade inválida.");
    }

    const now = Date.now();
    let id;
    if (args.id) {
      const previous = await ctx.db.get(args.id);
      if (!previous) throw new HttpError("Rascunho não encontrado.");
      await ctx.db.patch(args.id, { name, description, priceCents: args.priceCents, updatedAt: now, updatedBy: actorId });
      id = args.id;
    } else {
      // Impede criação ilimitada de rascunhos por erro ou abuso.
      const existing = await ctx.db.query("platformPlanDrafts").take(101);
      if (existing.length >= 100) throw new HttpError("Limite de 100 rascunhos atingido.");
      id = await ctx.db.insert("platformPlanDrafts", {
        name, description, priceCents: args.priceCents,
        createdBy: actorId, updatedBy: actorId,
        createdAt: now, updatedAt: now,
      });
    }
    await ctx.db.insert("platformAdminAuditLogs", {
      actorId,
      action: args.id ? "plan_draft_updated" : "plan_draft_created",
      recordType: "platformPlanDrafts",
      recordId: id,
      createdAt: now,
    });
    return id;
  },
});


/**
 * Gestão manual de pilotos e períodos de teste, restrita à conta global.
 * Não converte registros em assinaturas pagas nem interfere em fontes billing.
 *
 * Exige três confirmações do operador: feature flag privada, nome literal
 * da unidade e revisão otimista do entitlement (ID e updatedAt).
 * O status só restringe escritas das barbearias se o gate comercial estiver
 * habilitado; esta função NÃO o habilita automaticamente.
 */
export const managePilotTrial = mutation({
  args: {
    organizationId: v.id("organizations"),
    operation: v.union(
      v.literal("start"), v.literal("extend"),
      v.literal("suspend"), v.literal("resume"),
    ),
    confirmedName: v.string(),
    reason: v.string(),
    days: v.optional(v.number()),
    expectedEntitlementId: v.optional(v.id("organizationEntitlements")),
    expectedUpdatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    if (!pilotTrialWritesEnabled()) {
      throw new HttpError("Gestão de testes desabilitada nas configurações privadas do Convex.");
    }
    const actorId = await getAuthUserId(ctx);
    if (!actorId) throw new HttpError("Sessão inválida.");
    const org = await ctx.db.get(args.organizationId);
    if (!org || org.isDemo) throw new HttpError("Unidade inválida ou em modo demonstração.");
    if (args.confirmedName.trim() !== org.name) {
      throw new HttpError("Confirme o nome completo da barbearia antes de continuar.");
    }
    const reason = args.reason.trim();
    if (reason.length < 12 || reason.length > 350) {
      throw new HttpError("Informe uma justificativa de 12 a 350 caracteres.");
    }

    const existing = await ctx.db.query("organizationEntitlements")
      .withIndex("by_org", q => q.eq("organizationId", org._id)).unique();
    if (existing) {
      if (existing._id !== args.expectedEntitlementId || existing.updatedAt !== args.expectedUpdatedAt) {
        throw new HttpError("O status mudou desde a consulta. Recarregue os detalhes antes de confirmar.");
      }
      if (existing.source !== "pilot") {
        throw new HttpError("Assinaturas originadas de cobrança não podem ser alteradas manualmente.");
      }
    } else if (args.expectedEntitlementId !== undefined || args.expectedUpdatedAt !== undefined) {
      throw new HttpError("O status mudou desde a consulta. Recarregue os detalhes antes de confirmar.");
    }

    const now = Date.now();
    // Versão estritamente crescente para detectar duas operações no mesmo milissegundo.
    const nextVersion = Math.max(now, (existing?.updatedAt ?? 0) + 1);
    const dayMs = 86_400_000;
    const requiresDays = args.operation !== "suspend";
    if (requiresDays) {
      if (!Number.isSafeInteger(args.days) || args.days! < 1 || args.days! > 30) {
        throw new HttpError("Escolha entre 1 e 30 dias de teste.");
      }
    } else if (args.days !== undefined) {
      throw new HttpError("Suspensão não aceita dias de teste.");
    }

    if (args.operation === "start" && existing) {
      throw new HttpError("A barbearia já possui uma configuração de acesso.");
    }
    if (args.operation === "extend" && (!existing || existing.status !== "trialing")) {
      throw new HttpError("Apenas testes em andamento podem ser prorrogados.");
    }
    if (args.operation === "suspend" && (!existing || existing.status !== "trialing")) {
      throw new HttpError("Somente testes em andamento podem ser suspensos.");
    }
    if (args.operation === "resume" && (!existing || existing.status !== "suspended" ||
        typeof existing.trialEndsAt !== "number")) {
      throw new HttpError("Apenas testes suspensos podem ser reativados.");
    }
    if (args.operation !== "start" && !existing) {
      throw new HttpError("A barbearia ainda não possui um período de teste.");
    }

    const nextStatus: "trialing" | "suspended" =
      args.operation === "suspend" ? "suspended" : "trialing";
    const previousTrialEndsAt = existing?.trialEndsAt;
    let nextTrialEndsAt = previousTrialEndsAt;
    if (requiresDays) {
      const base = args.operation === "extend"
        ? Math.max(now, existing?.trialEndsAt ?? now) : now;
      nextTrialEndsAt = base + args.days! * dayMs;
      if (nextTrialEndsAt > now + 90 * dayMs) {
        throw new HttpError("O término do teste não pode ultrapassar 90 dias a partir de hoje.");
      }
    }
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: nextStatus, trialEndsAt: nextTrialEndsAt, updatedAt: nextVersion,
      });
    } else {
      await ctx.db.insert("organizationEntitlements", {
        organizationId: org._id,
        plan: "pilot",
        status: "trialing",
        source: "pilot",
        trialEndsAt: nextTrialEndsAt!,
        createdAt: now,
        updatedAt: nextVersion,
      });
    }

    await ctx.db.insert("platformAdminAuditLogs", {
      actorId,
      action: `pilot_trial_${args.operation}`,
      recordType: "organizations",
      recordId: org._id,
      reason,
      beforeStatus: existing?.status ?? "unconfigured",
      afterStatus: nextStatus,
      beforeTrialEndsAt: previousTrialEndsAt,
      afterTrialEndsAt: nextTrialEndsAt,
      createdAt: now,
    });
    return { status: nextStatus, trialEndsAt: nextTrialEndsAt ?? null };
  },
});

/** Histórico limitado de ações manuais. Nunca devolve dados internos da unidade. */
export const pilotTrialHistory = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new HttpError("Unidade não encontrada.");
    const events = await ctx.db.query("platformAdminAuditLogs")
      .withIndex("by_record", q => q.eq("recordType", "organizations")
        .eq("recordId", args.organizationId))
      .order("desc").take(20);
    return events.map(event => ({
      id: event._id,
      action: event.action,
      reason: event.reason ?? null,
      beforeStatus: event.beforeStatus ?? null,
      afterStatus: event.afterStatus ?? null,
      beforeTrialEndsAt: event.beforeTrialEndsAt ?? null,
      afterTrialEndsAt: event.afterTrialEndsAt ?? null,
      createdAt: event.createdAt,
    }));
  },
});


/* ------------------------ Asaas sandbox / inbox only ------------------------ */

/**
 * A API de billing da fase 1 apenas recolhe eventos do SANDBOX;
 * não existe associação evento->tenant, confirmação financeira ou grant de acesso.
 */
function sandboxWebhookEnabled(): boolean {
  return process.env.BARBER_ASAAS_WEBHOOK_ENABLED === "true" &&
    process.env.BARBER_ASAAS_ENV === "sandbox" &&
    process.env.BARBER_BILLING_ENFORCED !== "true" &&
    process.env.CONVEX_CLOUD_URL?.replace(/\/$/, "") ===
      "https://unique-tortoise-387.convex.cloud";
}

/** Apenas chamadas servidor-servidor, nunca uma mutation pública de navegador. */
export const recordAsaasSandboxEvent = internalMutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    paymentId: v.string(),
    subscriptionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!sandboxWebhookEnabled()) {
      throw new HttpError("Inbox financeira desabilitada neste deployment.");
    }
    // Revalidar no backend; nem mesmo a action HTTP é uma origem de confiança.
    if (!/^[a-zA-Z0-9_&-]{4,120}$/.test(args.eventId) ||
        !/^[a-zA-Z0-9_&-]{4,120}$/.test(args.paymentId) ||
        !/^PAYMENT_[A-Z_]{3,64}$/.test(args.eventType) ||
        (args.subscriptionId !== undefined && !/^[a-zA-Z0-9_&-]{4,120}$/.test(args.subscriptionId))) {
      throw new HttpError("Identificadores do evento inválidos.");
    }
    const previous = await ctx.db.query("billingWebhookInbox")
      .withIndex("by_provider_event", q => q.eq("provider", "asaas").eq("eventId", args.eventId))
      .unique();
    if (previous) return { duplicate: true };

    await ctx.db.insert("billingWebhookInbox", {
      provider: "asaas",
      environment: "sandbox",
      eventId: args.eventId,
      eventType: args.eventType,
      paymentId: args.paymentId,
      subscriptionId: args.subscriptionId,
      receivedAt: Date.now(),
    });
    // Deliberadamente NÃO acessa organizationEntitlements.
    return { duplicate: false };
  },
});

/** Leitura administrativa limitada, sem valores, emails ou dados pessoais. */
export const billingInbox = query({
  args: {},
  handler: async ctx => {
    await requirePlatformAdmin(ctx);
    const events = await ctx.db.query("billingWebhookInbox")
      .withIndex("by_received").order("desc").take(30);
    return {
      enabled: sandboxWebhookEnabled(),
      lookupEnabled: process.env.BARBER_ASAAS_LOOKUP_ENABLED === "true" &&
        process.env.BARBER_ASAAS_ENV === "sandbox" &&
        process.env.BARBER_BILLING_ENFORCED !== "true" &&
        process.env.CONVEX_CLOUD_URL?.replace(/\/$/, "") ===
          "https://unique-tortoise-387.convex.cloud" &&
        Boolean(process.env.BARBER_ASAAS_API_KEY?.trim()),
      items: events.map(e => ({
        id: e._id,
        eventId: e.eventId,
        eventType: e.eventType,
        paymentId: e.paymentId,
        subscriptionId: e.subscriptionId ?? null,
        receivedAt: e.receivedAt,
      })),
    };
  },
});


/** Busca mínima de evento para verificação externa somente leitura.
 * Esta query é interna: somente actions do backend a acessam.
 */
export const billingInboxPaymentForLookup = internalQuery({
  args: { id: v.id("billingWebhookInbox") },
  handler: async (ctx, { id }) => {
    const record = await ctx.db.get(id);
    if (!record || record.provider !== "asaas" || record.environment !== "sandbox") {
      return null;
    }
    return { paymentId: record.paymentId, eventId: record.eventId };
  },
});
