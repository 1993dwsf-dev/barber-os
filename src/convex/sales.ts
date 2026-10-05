import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  applyClientSaleStats,
  audit,
  awardLoyalty,
  bad,
  commissionAmount,
  nextSaleNumber,
  registerSaleStockOut,
  requireManage,
  requireView,
  resolveCommission,
} from "./lib";
import { todayISO } from "../lib/dates";

export type SaleItemInput = {
  kind: "servico" | "produto" | "pacote" | "plano";
  refId: string;
  qty: number;
  unitPriceCents?: number;
  costCents?: number;
  barberId?: string;
  coveredByCreditCents?: number;
  clientPackageId?: string;
  membershipId?: string;
};

export type PaymentInput = {
  method: "dinheiro" | "debito" | "credito" | "pix";
  amountCents: number;
};

/**
 * Motor de vendas: valida, grava venda/itens/pagamentos e dispara TODOS os efeitos
 * colaterais (estoque, comissões, fidelidade, caixa, histórico do cliente).
 * Usado pelo PDV, pela conclusão de atendimento e por compras de pacotes/assinaturas.
 */
export async function recordSale(
  ctx: MutationCtx,
  org: Doc<"organizations">,
  userId: Id<"users">,
  args: {
    date: string;
    clientId?: string;
    barberId?: string;
    appointmentId?: string;
    discountCents?: number;
    notes?: string;
    items: SaleItemInput[];
    payments: PaymentInput[];
  },
): Promise<{ saleId: Id<"sales">; totalCents: number; moneyCents: number }> {
  if (args.items.length === 0) bad("Adicione ao menos um item à venda.");

  // Resolve itens e calcula totais
  let subtotal = 0;
  let coveredTotal = 0;
  let costTotal = 0;
  const resolved: Array<{
    input: SaleItemInput;
    name: string;
    unit: number;
    cost: number;
  }> = [];

  for (const item of args.items) {
    if (!Number.isFinite(item.qty) || item.qty <= 0) bad("Quantidade inválida.");
    let name = "";
    let unit = item.unitPriceCents ?? 0;
    let cost = item.costCents ?? 0;
    if (item.kind === "servico") {
      const service = await ctx.db.get(item.refId as Id<"services">);
      if (!service || service.organizationId !== org._id) bad("Serviço não encontrado.");
      if (!service.active) bad(`O serviço "${service.name}" está inativo.`);
      name = service.name;
      unit = item.unitPriceCents ?? service.priceCents;
    } else if (item.kind === "produto") {
      const product = await ctx.db.get(item.refId as Id<"products">);
      if (!product || product.organizationId !== org._id) bad("Produto não encontrado.");
      if (!product.active) bad(`O produto "${product.name}" está inativo.`);
      if (product.stock < item.qty && !org.settings.allowNegativeStock)
        bad(`Estoque insuficiente para "${product.name}" (disponível: ${product.stock}).`);
      name = product.name;
      unit = item.unitPriceCents ?? product.priceCents;
      cost = product.costCents;
    } else if (item.kind === "pacote") {
      const pkg = await ctx.db.get(item.refId as Id<"packages">);
      if (!pkg || pkg.organizationId !== org._id) bad("Pacote não encontrado.");
      if (!pkg.active) bad(`O pacote "${pkg.name}" está inativo.`);
      name = pkg.name;
      unit = item.unitPriceCents ?? pkg.priceCents;
    } else {
      const plan = await ctx.db.get(item.refId as Id<"membershipPlans">);
      if (!plan || plan.organizationId !== org._id) bad("Plano não encontrado.");
      if (!plan.active) bad(`O plano "${plan.name}" está inativo.`);
      name = plan.name;
      unit = item.unitPriceCents ?? plan.priceCents;
    }

    const covered = Math.max(0, item.coveredByCreditCents ?? 0);
    if (covered > unit * item.qty) bad("Crédito aplicado maior que o valor do item.");

    if (item.kind === "produto") {
      const product = await ctx.db.get(item.refId as Id<"products">);
      if (product) {
        // valida crédito de pacote/assinatura quando aplicável
        if (covered > 0) bad("Crédito de pacote não se aplica a produtos.");
      }
    }
    if (covered > 0) {
      if (item.kind !== "servico") bad("Crédito de pacote só se aplica a serviços.");
      if (!item.clientPackageId && !item.membershipId)
        bad("Informe de onde vem o crédito usado neste serviço.");
      if (item.clientPackageId) {
        const cp = await ctx.db.get(item.clientPackageId as Id<"clientPackages">);
        if (!cp || cp.organizationId !== org._id) bad("Pacote do cliente não encontrado.");
        if (cp.status !== "ativo") bad("Este pacote do cliente não está ativo.");
        if (cp.expiryDate < args.date) bad("Pacote do cliente vencido.");
        const pkg = await ctx.db.get(cp.packageId);
        const covers = pkg?.items.some((i) => i.serviceId === item.refId);
        if (!covers) bad("Este serviço não faz parte do pacote do cliente.");
        const remaining = cp.creditsTotal - cp.creditsUsed;
        if (remaining <= 0) bad("O pacote do cliente está sem créditos.");
      }
      if (item.membershipId) {
        const m = await ctx.db.get(item.membershipId as Id<"memberships">);
        if (!m || m.organizationId !== org._id) bad("Assinatura do cliente não encontrada.");
        if (m.status !== "ativa") bad("A assinatura do cliente não está ativa.");
        const plan = await ctx.db.get(m.planId);
        if (!plan?.items.some((i) => i.serviceId === item.refId))
          bad("Este serviço não está incluído na assinatura do cliente.");
        if (m.creditsTotal - m.creditsUsed <= 0) bad("A assinatura do cliente está sem créditos.");
      }
    }

    subtotal += unit * item.qty;
    coveredTotal += covered;
    costTotal += cost * item.qty;
    resolved.push({ input: item, name, unit, cost });
  }

  const discount = Math.max(0, args.discountCents ?? 0);
  if (discount > subtotal) bad("O desconto não pode ser maior que o subtotal.");
  const total = subtotal - discount;
  const money = args.payments.reduce((s, p) => s + p.amountCents, 0);
  if (args.payments.some((p) => p.amountCents <= 0)) bad("Informe valores de pagamento válidos.");
  if (money + coveredTotal !== total)
    bad(
      `O total dos pagamentos (R$ ${(money / 100).toFixed(2)}) não confere com o total da venda (R$ ${(total / 100).toFixed(2)}).`,
    );

  // Caixa: pagamentos em dinheiro exigem sessão aberta
  let session: Doc<"cashSessions"> | null = null;
  if (args.payments.some((p) => p.method === "dinheiro")) {
    session = await ctx.db
      .query("cashSessions")
      .withIndex("by_org_status", (q) =>
        q.eq("organizationId", org._id).eq("status", "aberto"),
      )
      .first();
    if (!session) bad("Abra o caixa antes de registrar vendas em dinheiro.");
  }

  const number = await nextSaleNumber(ctx, org._id);
  const saleId = await ctx.db.insert("sales", {
    organizationId: org._id,
    number,
    date: args.date,
    createdAt: Date.now(),
    clientId: args.clientId as Id<"clients"> | undefined,
    barberId: args.barberId as Id<"barbers"> | undefined,
    appointmentId: args.appointmentId as Id<"appointments"> | undefined,
    subtotalCents: subtotal,
    discountCents: discount,
    totalCents: total,
    costCents: costTotal,
    status: "concluida",
    notes: args.notes,
    createdBy: userId,
  });

  let commissionTotal = 0;
  const hasService = resolved.some((r) => r.input.kind === "servico");

  for (const r of resolved) {
    const item = r.input;
    await ctx.db.insert("saleItems", {
      organizationId: org._id,
      saleId,
      kind: item.kind,
      serviceId: item.kind === "servico" ? (item.refId as Id<"services">) : undefined,
      productId: item.kind === "produto" ? (item.refId as Id<"products">) : undefined,
      packageId: item.kind === "pacote" ? (item.refId as Id<"packages">) : undefined,
      planId: item.kind === "plano" ? (item.refId as Id<"membershipPlans">) : undefined,
      appointmentId: args.appointmentId as Id<"appointments"> | undefined,
      clientPackageId: item.clientPackageId as Id<"clientPackages"> | undefined,
      membershipId: item.membershipId as Id<"memberships"> | undefined,
      name: r.name,
      quantity: item.qty,
      unitPriceCents: r.unit,
      totalCents: r.unit * item.qty,
      costCents: r.cost * item.qty,
      coveredByCreditCents: item.coveredByCreditCents ?? 0,
      barberId: item.barberId as Id<"barbers"> | undefined,
    });

    if (item.kind === "produto") {
      const product = await ctx.db.get(item.refId as Id<"products">);
      if (product) {
        await registerSaleStockOut(
          ctx,
          org,
          product,
          item.qty,
          saleId,
        userId,
        args.date,
      );
      }
    }

    if (item.kind === "servico" && item.barberId) {
      const barber = await ctx.db.get(item.barberId as Id<"barbers">);
      const service = await ctx.db.get(item.refId as Id<"services">);
      if (barber) {
        const rule = resolveCommission(barber, service ?? undefined, org);
        const calc = commissionAmount(rule, r.unit * item.qty, item.qty);
        const existing = await ctx.db
          .query("commissions")
          .withIndex("by_sale", (q) => q.eq("saleId", saleId))
          .filter(
            (q) =>
              q.eq(q.field("barberId"), barber._id) &&
              q.eq(q.field("description"), r.name),
          )
          .first();
        if (!existing) {
          await ctx.db.insert("commissions", {
            organizationId: org._id,
            barberId: barber._id,
            saleId,
            appointmentId: args.appointmentId as Id<"appointments"> | undefined,
            serviceId: item.refId as Id<"services">,
            description: r.name,
            date: args.date,
            model: calc.model,
            ratePercent: calc.ratePercent,
            baseCents: r.unit * item.qty,
            amountCents: calc.amount,
            status: "pendente",
            createdAt: Date.now(),
          });
          commissionTotal += calc.amount;
        }
      }
    }

    // consumo de créditos
    if (item.coveredByCreditCents && item.coveredByCreditCents > 0) {
      if (item.clientPackageId) {
        const cp = await ctx.db.get(item.clientPackageId as Id<"clientPackages">);
        if (cp) {
          const used = cp.creditsUsed + item.qty;
          await ctx.db.patch(cp._id, {
            creditsUsed: used,
            status: used >= cp.creditsTotal ? "esgotado" : "ativo",
          });
        }
      }
      if (item.membershipId) {
        const m = await ctx.db.get(item.membershipId as Id<"memberships">);
        if (m) await ctx.db.patch(m._id, { creditsUsed: m.creditsUsed + item.qty });
      }
    }
  }

  for (const p of args.payments) {
    await ctx.db.insert("payments", {
      organizationId: org._id,
      saleId,
      method: p.method,
      amountCents: p.amountCents,
      date: args.date,
      createdAt: Date.now(),
    });
    if (p.method === "dinheiro" && session) {
      await ctx.db.insert("cashMovements", {
        organizationId: org._id,
        sessionId: session._id,
        type: "venda",
        amountCents: p.amountCents,
        description: `Venda #${number}`,
        date: args.date,
        userId,
        saleId,
        createdAt: Date.now(),
      });
    }
  }

  if (args.clientId) {
    await applyClientSaleStats(ctx, args.clientId, money, hasService, args.date);
    if (money > 0) await awardLoyalty(ctx, org, args.clientId, money, saleId);
  }

  return { saleId, totalCents: total, moneyCents: money };
}

/* ------------------------------ mutações ------------------------------ */

export const createSale = mutation({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.optional(v.id("clients")),
    barberId: v.optional(v.id("barbers")),
    appointmentId: v.optional(v.id("appointments")),
    discountCents: v.optional(v.number()),
    notes: v.optional(v.string()),
    items: v.array(
      v.object({
        kind: v.union(
          v.literal("servico"),
          v.literal("produto"),
          v.literal("pacote"),
          v.literal("plano"),
        ),
        refId: v.string(),
        qty: v.number(),
        unitPriceCents: v.optional(v.number()),
        costCents: v.optional(v.number()),
        barberId: v.optional(v.id("barbers")),
        coveredByCreditCents: v.optional(v.number()),
        clientPackageId: v.optional(v.id("clientPackages")),
        membershipId: v.optional(v.id("memberships")),
      }),
    ),
    payments: v.array(
      v.object({
        method: v.union(v.literal("dinheiro"), v.literal("debito"), v.literal("credito"), v.literal("pix")),
        amountCents: v.number(),
      }),
    ),
    date: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "pos");
    const date = args.date ?? todayISO();
    const result = await recordSale(ctx, org, userId as Id<"users">, {
      date,
      clientId: args.clientId,
      barberId: args.barberId,
      appointmentId: args.appointmentId,
      discountCents: args.discountCents,
      notes: args.notes,
      items: args.items as SaleItemInput[],
      payments: args.payments as PaymentInput[],
    });
    await audit(ctx, org._id, userId, {
      action: "criou",
      module: "Vendas",
      recordType: "sales",
      recordId: result.saleId,
      summary: `Venda #${(await ctx.db.get(result.saleId))?.number} — R$ ${(result.totalCents / 100).toFixed(2)}`,
    });
    return result;
  },
});

/* ------------------------------ consultas ------------------------------ */

export const listSales = query({
  args: {
    organizationId: v.id("organizations"),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    barberId: v.optional(v.id("barbers")),
    method: v.optional(
      v.union(v.literal("dinheiro"), v.literal("debito"), v.literal("credito"), v.literal("pix")),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireView(ctx, args.organizationId, "pos");
    const limit = args.limit ?? 50;
    let sales = await ctx.db
      .query("sales")
      .withIndex("by_org_date", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .take(400);

    sales = sales.filter((s) => {
      if (args.from && s.date < args.from) return false;
      if (args.to && s.date > args.to) return false;
      if (args.clientId && s.clientId !== args.clientId) return false;
      if (args.barberId && s.barberId !== args.barberId) return false;
      return true;
    });

    const out = [];
    for (const sale of sales.slice(0, limit)) {
      const client = sale.clientId ? await ctx.db.get(sale.clientId) : null;
      const barber = sale.barberId ? await ctx.db.get(sale.barberId) : null;
      const payments = await ctx.db
        .query("payments")
        .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
        .collect();
      out.push({
        ...sale,
        clientName: client?.name ?? "Consumidor",
        barberName: barber?.name ?? "—",
        paymentMethods: payments.map((p) => p.method),
      });
    }
    return out;
  },
});

export const saleDetail = query({
  args: { organizationId: v.id("organizations"), saleId: v.id("sales") },
  handler: async (ctx, { organizationId, saleId }) => {
    await requireView(ctx, organizationId, "pos");
    const sale = await ctx.db.get(saleId);
    if (!sale || sale.organizationId !== organizationId) bad("Venda não encontrada.");
    const items = await ctx.db
      .query("saleItems")
      .withIndex("by_sale", (q) => q.eq("saleId", saleId))
      .collect();
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_sale", (q) => q.eq("saleId", saleId))
      .collect();
    const commissions = await ctx.db
      .query("commissions")
      .withIndex("by_sale", (q) => q.eq("saleId", saleId))
      .collect();
    const client = sale.clientId ? await ctx.db.get(sale.clientId) : null;
    const barber = sale.barberId ? await ctx.db.get(sale.barberId) : null;
    return { sale, items, payments, commissions, client, barber };
  },
});