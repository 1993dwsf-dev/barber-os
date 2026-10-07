import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { HttpError } from "./lib";

/**
 * Rate limiting de janela deslizante, gravado no banco.
 *
 * Sem isso, os pontos de entrada mais sensíveis ficavam expostos a abuso:
 *  - `joinByInviteCode` aceitava tentativas ilimitadas (força bruta no código
 *    de convite, que tem apenas 6 caracteres);
 *  - `createOrganization` / `enterDemoMode` podiam ser chamados em laço;
 *  - uploads não tinham nenhum teto por usuário.
 *
 * A janela é por usuário autenticado + ação, então uma conta não consegue
 * consumir o limite de outra e o limite não depende de IP (não confiável em
 * ambiente serverless/iframes).
 */

export type RateLimitRule = { limit: number; windowMs: number };

export const RATE_LIMITS = {
  createOrganization: { limit: 5, windowMs: 60 * 60_000 },
  joinByInviteCode: { limit: 10, windowMs: 10 * 60_000 },
  enterDemoMode: { limit: 3, windowMs: 60 * 60_000 },
  regenerateInviteCode: { limit: 10, windowMs: 60 * 60_000 },
  generateUploadUrl: { limit: 60, windowMs: 60 * 60_000 },
} satisfies Record<string, RateLimitRule>;

export type RateLimitAction = keyof typeof RATE_LIMITS;

function limitMessage(rule: RateLimitRule, remainingMs: number): string {
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  return `Muitas tentativas em pouco tempo. Tente novamente em ${minutes} minuto(s).`;
}

/**
 * Conta a tentativa atual. Lança `HttpError` amigável quando o limite da
 * janela é atingido; caso contrário registra a tentativa.
 */
export async function enforceRateLimit(
  ctx: MutationCtx,
  userId: string,
  action: RateLimitAction,
  extraKey?: string,
): Promise<void> {
  const rule = RATE_LIMITS[action];
  const key = `${action}:${userId}${extraKey ? `:${extraKey}` : ""}`;
  const now = Date.now();

  const rows = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .collect();

  let oldestActive = now;
  let activeCount = 0;
  for (const row of rows) {
    if (row.expiresAt <= now) {
      await ctx.db.delete(row._id);
      continue;
    }
    activeCount += 1;
    if (row.createdAt < oldestActive) oldestActive = row.createdAt;
  }

  if (activeCount >= rule.limit) {
    throw new HttpError(limitMessage(rule, oldestActive + rule.windowMs - now));
  }

  await ctx.db.insert("rateLimits", {
    key,
    action,
    userId: userId as Id<"users">,
    createdAt: now,
    expiresAt: now + rule.windowMs,
  });
}

/** Libera a janela (usado quando a tentativa deu certo, ex.: convite correto). */
export async function clearRateLimit(
  ctx: MutationCtx,
  userId: string,
  action: RateLimitAction,
): Promise<void> {
  const key = `${action}:${userId}`;
  const rows = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .collect();
  for (const row of rows) await ctx.db.delete(row._id);
}
