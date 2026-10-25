import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { HttpError } from "./lib";

/**
 * Administração da plataforma (não da barbearia).
 *
 * O acesso depende de duas variáveis privadas do deployment Convex, jamais do
 * frontend, do papel "owner" de uma barbearia ou de um parâmetro enviado por cliente.
 * Por padrão, sem as DUAS variáveis configuradas, ninguém tem acesso.
 */
async function isPlatformAdmin(ctx: QueryCtx): Promise<boolean> {
  const allowedId = process.env.BARBER_PLATFORM_ADMIN_USER_ID?.trim();
  const allowedEmail = process.env.BARBER_PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  if (!allowedId || !allowedEmail) return false;
  const userId = await getAuthUserId(ctx);
  if (!userId || userId !== allowedId) return false;
  const user = await ctx.db.get(userId);
  if (!user || user.isAnonymous === true || !user.emailVerificationTime) return false;
  return user.email?.trim().toLowerCase() === allowedEmail;
}

async function requirePlatformAdmin(ctx: QueryCtx): Promise<void> {
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
