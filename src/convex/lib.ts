import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { todayISO } from "../lib/dates";
import { type AppRole, type Cap, canView, canManage } from "../lib/rbac";

export class HttpError extends Error {}

/* ------------------------------ auth / tenancy ------------------------------ */

export async function requireUserId(ctx: QueryCtx | MutationCtx): Promise<string> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new HttpError("Faça login para continuar.");
  return userId;
}

export type MemberCtx = {
  userId: string;
  role: AppRole;
  member: Doc<"organizationMembers">;
  org: Doc<"organizations">;
};

/** Garante que o usuário é membro da organização e retorna o contexto. */
export async function requireMember(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
): Promise<MemberCtx> {
  const userId = await requireUserId(ctx);
  const member = await ctx.db
    .query("organizationMembers")
    .withIndex("by_org_user", (q) =>
      q.eq("organizationId", organizationId as Id<"organizations">).eq("userId", userId as Id<"users">),
    )
    .first();
  if (!member) throw new HttpError("Você não tem acesso a esta organização.");
  const org = await ctx.db.get(member.organizationId);
  if (!org) throw new HttpError("Organização não encontrada.");
  return { userId, role: member.role as AppRole, member, org };
}

/** Garante permissão de leitura sobre um módulo. */
export async function requireView(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  cap: Cap,
): Promise<MemberCtx> {
  const m = await requireMember(ctx, organizationId);
  if (!canView(m.role, cap)) throw new HttpError("Sem permissão para visualizar este módulo.");
  return m;
}

/** Garante permissão de escrita sobre um módulo. */
export async function requireManage(
  ctx: MutationCtx,
  organizationId: string,
  cap: Cap,
): Promise<MemberCtx> {
  const m = await requireMember(ctx, organizationId);
  if (!canManage(m.role, cap)) throw new HttpError("Sem permissão para executar esta ação.");
  return m;
}

export async function requireOwner(
  ctx: MutationCtx,
  organizationId: string,
): Promise<MemberCtx> {
  const m = await requireMember(ctx, organizationId);
  if (m.role !== "owner") throw new HttpError("Apenas o proprietário pode executar esta ação.");
  return m;
}

/* ------------------------------ auditoria ------------------------------ */

export async function audit(
  ctx: MutationCtx,
  organizationId: string,
  userId: string | undefined,
  args: { action: string; module: string; recordType?: string; recordId?: string; summary: string },
): Promise<void> {
  let userName: string | undefined;
  if (userId) {
    const u = await ctx.db.get(userId as Id<"users">);
    userName = u?.name ?? u?.email ?? undefined;
  }
  await ctx.db.insert("auditLogs", {
    organizationId: organizationId as Id<"organizations">,
    userId: userId as Id<"users"> | undefined,
    userName,
    action: args.action,
    module: args.module,
    recordType: args.recordType,
    recordId: args.recordId,
    summary: args.summary,
    createdAt: Date.now(),
  });
}

/* ------------------------------ notificações (com dedupe) ------------------------------ */

export async function notify(
  ctx: MutationCtx,
  organizationId: string,
  args: {
    type: string;
    title: string;
    message: string;
    severity?: "info" | "alerta" | "critico";
    dedupKey?: string;
    link?: string;
  },
): Promise<void> {
  if (args.dedupKey) {
    const existing = await ctx.db
      .query("notifications")
      .withIndex("by_org_dedup", (q) =>
        q
          .eq("organizationId", organizationId as Id<"organizations">)
          .eq("dedupKey", args.dedupKey!),
      )
      .first();
    if (existing && existing.status !== "descartada" && existing.status !== "resolvida") return;
    if (existing) await ctx.db.delete(existing._id);
  }
  await ctx.db.insert("notifications", {
    organizationId: organizationId as Id<"organizations">,
    type: args.type,
    title: args.title,
    message: args.message,
    severity: args.severity ?? "info",
    status: "nao_lida",
    dedupKey: args.dedupKey,
    link: args.link,
    createdAt: Date.now(),
  });
}

/* ------------------------------ numeração de vendas ------------------------------ */

export async function nextSaleNumber(ctx: MutationCtx, organizationId: string): Promise<number> {
  const org = await ctx.db.get(organizationId as Id<"organizations">);
  const n = (org?.salesCount ?? 0) + 1;
  await ctx.db.patch(organizationId as Id<"organizations">, { salesCount: n });
  return n;
}

/* ------------------------------ comissões ------------------------------ */

type CommissionRule = { model: "herdar" | "percentual" | "fixo"; value?: number };

export function resolveCommission(
  barber: Doc<"barbers">,
  service: Doc<"services"> | undefined,
  org: Doc<"organizations">,
): { model: "percentual" | "fixo"; value: number } {
  const pick = (r: CommissionRule | undefined): CommissionRule => r ?? { model: "herdar" };
  let rule = pick(service ? { model: service.commissionModel, value: service.commissionValue } : undefined);
  if (rule.model === "herdar") rule = pick({ model: barber.commissionModel, value: barber.commissionValue });
  if (rule.model === "herdar")
    rule = { model: org.settings.defaultCommissionModel, value: org.settings.defaultCommissionValue };
  if (rule.model === "herdar" || rule.value === undefined || rule.value === null)
    rule = { model: "percentual", value: 40 };
  return { model: rule.model as "percentual" | "fixo", value: rule.value as number };
}

export function commissionAmount(
  rule: { model: "percentual" | "fixo"; value: number },
  baseCents: number,
  quantity: number,
): { model: "percentual" | "fixo"; ratePercent?: number; amount: number } {
  if (rule.model === "fixo") {
    return { model: "fixo", amount: Math.round(rule.value * quantity) };
  }
  return {
    model: "percentual",
    ratePercent: rule.value,
    amount: Math.round((baseCents * rule.value) / 100),
  };
}

/* ------------------------------ fidelidade ------------------------------ */

export async function ensureLoyaltyAccount(
  ctx: MutationCtx,
  organizationId: string,
  clientId: string,
): Promise<Doc<"loyaltyAccounts">> {
  const existing = await ctx.db
    .query("loyaltyAccounts")
    .withIndex("by_org_client", (q) =>
      q.eq("organizationId", organizationId as Id<"organizations">).eq("clientId", clientId as Id<"clients">),
    )
    .first();
  if (existing) return existing;
  const id = await ctx.db.insert("loyaltyAccounts", {
    organizationId: organizationId as Id<"organizations">,
    clientId: clientId as Id<"clients">,
    points: 0,
    totalEarned: 0,
    totalRedeemed: 0,
  });
  return (await ctx.db.get(id))!;
}

/** Premia pontos por dinheiro real pago (exclui pagamentos com crédito de pacote/assinatura). */
export async function awardLoyalty(
  ctx: MutationCtx,
  org: Doc<"organizations">,
  clientId: string,
  moneyPaidCents: number,
  saleId?: string,
): Promise<number> {
  const rate = org.settings.loyaltyPointsPerReal ?? 1;
  const points = Math.floor(moneyPaidCents / 100 * rate);
  if (points <= 0) return 0;
  const account = await ensureLoyaltyAccount(ctx, org._id, clientId);
  await ctx.db.patch(account._id, { points: account.points + points, totalEarned: account.totalEarned + points });
  await ctx.db.insert("loyaltyTransactions", {
    organizationId: org._id,
    clientId: clientId as Id<"clients">,
    type: "ganho",
    points,
    reason: saleId ? `Venda #${saleId.slice(-6)}` : "Crédito de pontos",
    saleId: saleId as Id<"sales"> | undefined,
    date: todayISO(),
    createdAt: Date.now(),
  });
  return points;
}

/* ------------------------------ estatísticas do cliente ------------------------------ */

export async function applyClientSaleStats(
  ctx: MutationCtx,
  clientId: string,
  totalCents: number,
  hadService: boolean,
  date: string,
): Promise<void> {
  const client = await ctx.db.get(clientId as Id<"clients">);
  if (!client) return;
  const last = client.lastVisitDate ?? "";
  await ctx.db.patch(client._id, {
    totalSpentCents: client.totalSpentCents + totalCents,
    totalVisits: client.totalVisits + (hadService ? 1 : 0),
    lastVisitDate: date > last ? date : last,
    updatedAt: Date.now(),
  });
}

/* ------------------------------ estoque ------------------------------ */

export async function registerSaleStockOut(
  ctx: MutationCtx,
  org: Doc<"organizations">,
  product: Doc<"products">,
  quantity: number,
  saleId: string,
  userId: string,
  date: string,
): Promise<void> {
  const newStock = product.stock - quantity;
  await ctx.db.patch(product._id, { stock: newStock, updatedAt: Date.now() });
  await ctx.db.insert("inventoryMovements", {
    organizationId: org._id,
    productId: product._id,
    date,
    quantity,
    type: "venda",
    reference: `Venda`,
    saleId: saleId as Id<"sales">,
    userId: userId as Id<"users">,
    createdAt: Date.now(),
  });
  if (org.settings.lowStockAlerts && newStock <= product.minStock) {
    await notify(ctx, org._id, {
      type: "estoque_baixo",
      title: "Estoque baixo",
      message: `${product.name} está com ${newStock} ${product.unit} (mínimo: ${product.minStock}).`,
      severity: newStock <= 0 ? "critico" : "alerta",
      dedupKey: `estoque_baixo:${product._id}:${newStock <= 0 ? "zero" : "min"}`,
      link: "/app/estoque",
    });
  }
}

/* ------------------------------ integridade de referência ------------------------------ */

/**
 * Garante que um documento referenciado (cliente, barbeiro, serviço, plano…)
 * pertence à organização da requisição.
 *
 * Sem isso, um ID de outra empresa era aceito como referência e depois
 * aparecia em listagens que fazem `db.get(id)` — vazando nome e telefone de
 * clientes e barbeiros de outro tenant.
 */
export async function requireSameOrg<T extends { organizationId: unknown }>(
  doc: T | null | undefined,
  organizationId: string,
  label: string,
): Promise<T> {
  if (!doc || String(doc.organizationId) !== organizationId) bad(`${label} não encontrado.`);
  return doc;
}

/* ------------------------------ erros ------------------------------ */

export function bad(message: string): never {
  throw new HttpError(message);
}
