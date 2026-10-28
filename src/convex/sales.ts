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
  requireSameOrg,
  requireView,
  resolveCommission,
} from "./lib";
import { text } from "./validation";
import { todayISO } from "../lib/dates";

function assertNonNegativeCents(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    bad(`${label} deve ser um valor inteiro, não negativo e válido.`);
  }
}

function assertPositiveQuantity(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    bad("A quantidade deve ser um número inteiro maior que zero.");
  }
}

function canOverrideFinancialValues(role: string): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}

export type SaleItemInput = {
  kind: "servico" | "produto";
  refId: string;
  qty: number;
  unitPriceCents?: number;
  costCents?: number;
  barberId?: string;
};

export type PaymentInput = {
  method: "dinheiro" | "debito" | "credito" | "pix";
  amountCents: number;
};

/**
 * Motor de vendas: valida, grava venda/itens/pagamentos e dispara TODOS os efeitos
 * colaterais (estoque, comissões, fidelidade, caixa, histórico do cliente).
 * Exclusivo do PDV; a Agenda apenas encaminha o atendimento para cobrança.
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

  // Toda referência precisa pertencer à organização: `applyClientSaleStats` e
  // `awardLoyalty` escrevem nos documentos referenciados, então um ID de outro
  // tenant aqui significava alterar dados de outra empresa.
  if (args.clientId)
    await requireSameOrg(await ctx.db.get(args.clientId as Id<"clients">), org._id, "Cliente");
  if (args.barberId)
    await requireSameOrg(await ctx.db.get(args.barberId as Id<"barbers">), org._id, "Barbeiro");
  let appointment: Doc<"appointments"> | null = null;
  if (args.appointmentId) {
    appointment = await requireSameOrg(
      await ctx.db.get(args.appointmentId as Id<"appointments">),
      org._id,
      "Agendamento",
    );
    if (
      appointment.status === "concluido" ||
      appointment.status === "cancelado" ||
      appointment.status === "falta" ||
      appointment.paymentStatus === "pago" ||
      appointment.saleId
    ) bad("Este atendimento já foi pago ou não pode ser cobrado.");

    // Protege também registros legados com venda vinculada, mesmo se
    // os campos saleId/status do agendamento estiverem desatualizados.
    const previousSale = await ctx.db.query("sales")
      .withIndex("by_org_appointment", q =>
        q.eq("organizationId", org._id).eq("appointmentId", appointment!._id),
      ).first();
    if (previousSale?.status === "concluida") bad("Este atendimento já possui uma venda registrada.");

    if (args.clientId !== appointment.clientId || args.barberId !== appointment.barberId)
      bad("Cliente ou barbeiro não confere com o agendamento.");
    const linkedServices = args.items.filter(
      item => item.kind === "servico" && item.refId === appointment!.serviceId,
    );
    if (
      linkedServices.length !== 1 ||
      linkedServices[0].qty !== 1 ||
      linkedServices[0].barberId !== appointment.barberId ||
      linkedServices[0].unitPriceCents !== appointment.priceCents
    ) bad("A venda deve incluir uma única vez o serviço e preço combinados no agendamento.");
  }

  const membership = await ctx.db
    .query("organizationMembers")
    .withIndex("by_org_user", (q) =>
      q.eq("organizationId", org._id).eq("userId", userId),
    )
    .first();

  if (!membership) {
    bad("Usuário não pertence a esta organização.");
  }

  const canOverride = canOverrideFinancialValues(membership.role);

  assertNonNegativeCents(args.discountCents ?? 0, "Desconto");

  if ((args.discountCents ?? 0) > 0 && !canOverride) {
    bad("Somente gestores autorizados podem conceder descontos.");
  }

  // Resolve itens e calcula totais
  let subtotal = 0;
  let costTotal = 0;
  const resolved: Array<{
    input: SaleItemInput;
    name: string;
    unit: number;
    cost: number;
  }> = [];

  for (const item of args.items) {
    assertPositiveQuantity(item.qty);

    if (item.barberId)
      await requireSameOrg(
        await ctx.db.get(item.barberId as Id<"barbers">),
        org._id,
        "Barbeiro",
      );
    let name = "";
    let catalogPrice = 0;
    let catalogCost = 0;

    if (item.kind === "servico") {
      const service = await ctx.db.get(item.refId as Id<"services">);

      if (!service || service.organizationId !== org._id) {
        bad("Serviço não encontrado.");
      }

      if (!service.active) {
        bad(`O serviço "${service.name}" está inativo.`);
      }

      name = service.name;
      catalogPrice = service.priceCents;
    } else if (item.kind === "produto") {
      const product = await ctx.db.get(item.refId as Id<"products">);

      if (!product || product.organizationId !== org._id) {
        bad("Produto não encontrado.");
      }

      if (!product.active) {
        bad(`O produto "${product.name}" está inativo.`);
      }

      if (product.stock < item.qty && !org.settings.allowNegativeStock) {
        bad(
          `Estoque insuficiente para "${product.name}" (disponível: ${product.stock}).`,
        );
      }

      name = product.name;
      catalogPrice = product.priceCents;
      catalogCost = product.costCents;
    }

    // Alterações manuais de preço exigem um papel privilegiado.
    if (item.unitPriceCents !== undefined && !canOverride) {
      const agreedPrice = appointment && item.kind === "servico" && item.refId === appointment.serviceId
        ? appointment.priceCents : catalogPrice;
      if (item.unitPriceCents !== agreedPrice) {
        bad("Você não tem permissão para alterar o preço do catálogo.");
      }
    }

    const unit = item.unitPriceCents ?? catalogPrice;
    const cost = catalogCost;

    assertNonNegativeCents(unit, "Preço unitário");
    assertNonNegativeCents(cost, "Custo unitário");

    const lineTotal = unit * item.qty;

    if (!Number.isSafeInteger(lineTotal)) {
      bad("O valor total do item excede o limite permitido.");
    }

    subtotal += unit * item.qty;
    costTotal += cost * item.qty;
    resolved.push({ input: item, name, unit, cost });
  }

  const discount = Math.max(0, args.discountCents ?? 0);
  if (discount > subtotal) bad("O desconto não pode ser maior que o subtotal.");
  const total = subtotal - discount;

  for (const payment of args.payments) {
    assertNonNegativeCents(payment.amountCents, "Pagamento");

    if (payment.amountCents === 0) {
      bad("O valor de cada pagamento deve ser maior que zero.");
    }
  }

  const money = args.payments.reduce(
    (sum, payment) => sum + payment.amountCents,
    0,
  );

  if (!Number.isSafeInteger(money)) {
    bad("A soma dos pagamentos excede o limite permitido.");
  }

  if (money !== total)
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
    notes: text(args.notes, "note", "Observações"),
    createdBy: userId,
  });

    const hasService = resolved.some((r) => r.input.kind === "servico");

  for (const r of resolved) {
    const item = r.input;
    await ctx.db.insert("saleItems", {
      organizationId: org._id,
      saleId,
      kind: item.kind,
      serviceId: item.kind === "servico" ? (item.refId as Id<"services">) : undefined,
      productId: item.kind === "produto" ? (item.refId as Id<"products">) : undefined,
      appointmentId: args.appointmentId as Id<"appointments"> | undefined,
      name: r.name,
      quantity: item.qty,
      unitPriceCents: r.unit,
      totalCents: r.unit * item.qty,
      costCents: r.cost * item.qty,
      coveredByCreditCents: 0,
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
        }
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

  if (appointment) {
    await ctx.db.patch(appointment._id, {
      status: "concluido",
      paymentStatus: "pago",
      saleId,
      updatedAt: Date.now(),
    });
    await audit(ctx, org._id, userId, {
      action: "concluiu", module: "Agenda", recordType: "appointments",
      recordId: appointment._id, summary: `Atendimento concluído pela venda #${number}`,
    });
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
        ),
        refId: v.string(),
        qty: v.number(),
        unitPriceCents: v.optional(v.number()),
        costCents: v.optional(v.number()),
        barberId: v.optional(v.id("barbers")),
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


/**
 * Cancela um lançamento errado sem apagar a trilha financeira.
 * Rejeita situações que não podem ser revertidas contabilmente com segurança.
 * Não realiza estorno bancário/cartão: esse procedimento é externo ao Barber OS.
 */
export const cancelSale = mutation({
  args: {
    organizationId: v.id("organizations"),
    saleId: v.id("sales"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "pos");
    const reason = args.reason.trim();
    if (reason.length < 10 || reason.length > 300)
      bad("Informe o motivo do cancelamento (10 a 300 caracteres).");
    const sale = await ctx.db.get(args.saleId);
    if (!sale || sale.organizationId !== org._id) bad("Venda não encontrada nesta barbearia.");
    if (sale.status !== "concluida") bad("Esta venda já foi cancelada.");

    const items = await ctx.db.query("saleItems")
      .withIndex("by_sale", q => q.eq("saleId", sale._id)).collect();
    const commissions = await ctx.db.query("commissions")
      .withIndex("by_sale", q => q.eq("saleId", sale._id)).collect();
    if (commissions.some(c => c.status !== "pendente"))
      bad("A venda tem comissão aprovada ou paga. Regularize a comissão antes de cancelar.");

    const cashMoves = await ctx.db.query("cashMovements")
      .withIndex("by_org", q => q.eq("organizationId", org._id)).collect();
    const saleCash = cashMoves.filter(m => m.saleId === sale._id && m.type === "venda");
    for (const move of saleCash) {
      const session = await ctx.db.get(move.sessionId);
      if (!session || session.status !== "aberto")
        bad("A venda pertence a um caixa fechado. Solicite ajuste contábil ao responsável.");
    }
    const earned = sale.clientId
      ? await ctx.db.query("loyaltyTransactions")
          .withIndex("by_org_client", q => q.eq("organizationId", org._id).eq("clientId", sale.clientId!))
          .collect()
      : [];
    const fromSale = earned.filter(t => t.saleId === sale._id && t.type === "ganho");
    const points = fromSale.reduce((sum, t) => sum + t.points, 0);
    const loyaltyAccount = sale.clientId && points > 0
      ? await ctx.db.query("loyaltyAccounts")
          .withIndex("by_org_client", q => q.eq("organizationId", org._id).eq("clientId", sale.clientId!)).unique()
      : null;
    if (points && (!loyaltyAccount || loyaltyAccount.points < points))
      bad("Pontos desta venda já foram utilizados. Regularize a fidelidade antes de cancelar.");

    // A transação Convex é atômica: ou todos os efeitos são revertidos, ou nenhum.
    const now = Date.now();
    for (const item of items) {
      if (item.kind === "produto" && item.productId) {
        const product = await ctx.db.get(item.productId);
        if (!product || product.organizationId !== org._id)
          bad("Produto da venda não existe mais; cancelamento manual necessário.");
        await ctx.db.patch(product._id, { stock: product.stock + item.quantity, updatedAt: now });
        await ctx.db.insert("inventoryMovements", {
          organizationId: org._id, productId: product._id, date: todayISO(),
          quantity: item.quantity, type: "devolucao", saleId: sale._id, userId,
          reference: `Cancelamento venda #${sale.number}`, notes: reason, createdAt: now,
        });
      }
    }
    for (const move of saleCash) {
      await ctx.db.insert("cashMovements", {
        organizationId: org._id, sessionId: move.sessionId, type: "estorno",
        amountCents: move.amountCents, description: `Cancelamento venda #${sale.number}: ${reason}`,
        date: todayISO(), userId, saleId: sale._id, createdAt: now,
      });
    }
    for (const commission of commissions) await ctx.db.delete(commission._id);
    if (sale.appointmentId) {
      const appointment = await ctx.db.get(sale.appointmentId);
      if (appointment?.organizationId === org._id && appointment.saleId === sale._id)
        await ctx.db.patch(appointment._id, {
          saleId: undefined, status: "agendado", paymentStatus: "nao_pago", updatedAt: now,
        });
    }
    if (sale.clientId) {
      const client = await ctx.db.get(sale.clientId);
      if (client?.organizationId === org._id) {
        const hasService = items.some(i => i.kind === "servico");
        await ctx.db.patch(client._id, {
          totalSpentCents: Math.max(0, client.totalSpentCents - sale.totalCents),
          totalVisits: Math.max(0, client.totalVisits - (hasService ? 1 : 0)),
          updatedAt: now,
        });
      }
      if (points && loyaltyAccount) {
        await ctx.db.patch(loyaltyAccount._id, {
          points: loyaltyAccount.points - points,
          totalEarned: Math.max(0, loyaltyAccount.totalEarned - points),
        });
        await ctx.db.insert("loyaltyTransactions", {
          organizationId: org._id, clientId: sale.clientId,
          type: "ajuste", points: -points,
          reason: `Estorno da venda #${sale.number}: ${reason}`,
          saleId: sale._id, date: todayISO(), createdAt: now,
        });
      }
    }
    await ctx.db.patch(sale._id, {
      status: "cancelada", notes: [sale.notes, `Cancelada: ${reason}`].filter(Boolean).join(" — "),
    });
    await audit(ctx, org._id, userId, {
      action: "cancelou", module: "PDV", recordType: "sales",
      recordId: sale._id, summary: `Venda #${sale.number} cancelada: ${reason}`,
    });
    return { canceled: true };
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
    const { role, member } = await requireView(ctx, args.organizationId, "pos");
    // Barbeiros só podem consultar vendas vinculadas ao seu próprio perfil.
    // Sem vínculo explícito com um barbeiro, não exibimos o histórico financeiro.
    if (role === "barber" && !member.barberId) return [];
    const limit = args.limit ?? 50;
    let sales = await ctx.db
      .query("sales")
      .withIndex("by_org_date", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .take(400);

    sales = sales.filter((s) => {
      if (role === "barber" && s.barberId !== member.barberId) return false;
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
    const { role, member } = await requireView(ctx, organizationId, "pos");
    const sale = await ctx.db.get(saleId);
    if (
      !sale ||
      sale.organizationId !== organizationId ||
      (role === "barber" && (!member.barberId || sale.barberId !== member.barberId))
    ) bad("Venda não encontrada.");
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