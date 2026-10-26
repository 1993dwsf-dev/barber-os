import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
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
