import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { HttpError } from "./lib";

/** A homologação continua como está; no comercial, a falta de configuração bloqueia ações. */
export function isCommercialGateRequired(): boolean {
  return process.env.BARBER_AUTH_COMMERCIAL_ENABLED === "true" ||
    process.env.BARBER_BILLING_ENFORCED === "true";
}

export type EntitlementStatus = Doc<"organizationEntitlements">["status"];

export function canOperate(
  entitlement: Doc<"organizationEntitlements"> | null,
  now: number,
): boolean {
  if (!entitlement) return false;
  if (entitlement.status === "trialing")
    return typeof entitlement.trialEndsAt === "number" && entitlement.trialEndsAt > now;
  if (entitlement.status === "active")
    return typeof entitlement.periodEndsAt === "number" && entitlement.periodEndsAt > now;
  if (entitlement.status === "past_due")
    return typeof entitlement.graceEndsAt === "number" && entitlement.graceEndsAt > now;
  return false;
}

export async function requireCommercialWriteAccess(
  ctx: QueryCtx | MutationCtx,
  org: Doc<"organizations">,
): Promise<void> {
  if (!isCommercialGateRequired()) return;
  if (org.isDemo) {
    // Mode demo is forbidden during commercial launch; never use it as a paid-tenant bypass.
    throw new HttpError("O modo demonstração não está disponível neste ambiente.");
  }
  const entitlement = await ctx.db
    .query("organizationEntitlements")
    .withIndex("by_org", q => q.eq("organizationId", org._id))
    .unique();
  if (!canOperate(entitlement, Date.now()))
    throw new HttpError("Acesso de edição indisponível: plano ausente, expirado ou suspenso.");
}

export async function getCommercialStatus(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"organizations">,
) {
  const entitlement = await ctx.db.query("organizationEntitlements")
    .withIndex("by_org", q => q.eq("organizationId", orgId)).unique();
  return {
    enforced: isCommercialGateRequired(),
    plan: entitlement?.plan ?? null,
    status: entitlement?.status ?? "unconfigured",
    trialEndsAt: entitlement?.trialEndsAt ?? null,
    periodEndsAt: entitlement?.periodEndsAt ?? null,
    graceEndsAt: entitlement?.graceEndsAt ?? null,
    canWrite: !isCommercialGateRequired() || canOperate(entitlement, Date.now()),
  };
}
