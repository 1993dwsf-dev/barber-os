import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireView } from "./lib";

const MONEY = new Set(["dinheiro", "debito", "credito", "pix"]);

type SaleRow = Doc<"sales"> & {
  items: Doc<"saleItems">[];
  payments: Doc<"payments">[];
  clientName: string;
  barberName: string;
  paidCents: number;
};

/**
 * Pacote de dados para a central de relatórios: registros brutos + agregados
 * do período. O frontend filtra/exporta em CSV a partir daqui.
 */
export const bundle = query({
  args: {
    organizationId: v.id("organizations"),
    from: v.string(),
    to: v.string(),
  },
  handler: async (ctx, args) => {
    const { org } = await requireView(ctx, args.organizationId, "reports");

    const allSales = await ctx.db
      .query("sales")
      .withIndex("by_org_date", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const sales = allSales.filter((s) => s.date >= args.from && s.date <= args.to).sort((a, b) =>
      b.date.localeCompare(a.date),
    );

    const saleRows: SaleRow[] = [];
    for (const sale of sales) {
      const [items, payments] = await Promise.all([
        ctx.db.query("saleItems").withIndex("by_sale", (q) => q.eq("saleId", sale._id)).collect(),
        ctx.db.query("payments").withIndex("by_sale", (q) => q.eq("saleId", sale._id)).collect(),
      ]);
      const client = sale.clientId ? await ctx.db.get(sale.clientId) : null;
      const barber = sale.barberId ? await ctx.db.get(sale.barberId) : null;
      saleRows.push({
        ...sale,
        items,
        payments,
        clientName: client?.name ?? "Consumidor",
        clientId: sale.clientId as Id<"clients"> | undefined,
        barberName: barber?.name ?? "—",
        barberId: sale.barberId,
        paidCents: payments.filter((p) => MONEY.has(p.method)).reduce((s, p) => s + p.amountCents, 0),
      });
    }

    const appointments = (
      await ctx.db
        .query("appointments")
        .withIndex("by_org_date", (q) => q.eq("organizationId", args.organizationId))
        .collect()
    )
      .filter((a) => a.date >= args.from && a.date <= args.to)
      .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));

    const appointmentRows = [];
    for (const a of appointments) {
      const [client, barber, service] = await Promise.all([
        ctx.db.get(a.clientId),
        ctx.db.get(a.barberId),
        ctx.db.get(a.serviceId),
      ]);
      appointmentRows.push({
        ...a,
        clientName: client?.name ?? "—",
        barberName: barber?.name ?? "—",
        serviceName: service?.name ?? "—",
        barberId: a.barberId,
        clientId: a.clientId,
        serviceId: a.serviceId,
      });
    }

    const expenses = (
      await ctx.db
        .query("expenses")
        .withIndex("by_org_date", (q) => q.eq("organizationId", args.organizationId))
        .collect()
    )
      .filter((e) => e.date >= args.from && e.date <= args.to)
      .sort((a, b) => b.date.localeCompare(a.date));

    const commissions = (
      await ctx.db
        .query("commissions")
        .withIndex("by_org_date", (q) => q.eq("organizationId", args.organizationId))
        .collect()
    )
      .filter((c) => c.date >= args.from && c.date <= args.to);
    const commissionRows = [];
    for (const c of commissions) {
      const barber = await ctx.db.get(c.barberId);
      commissionRows.push({ ...c, barberName: barber?.name ?? "—", barberId: c.barberId });
    }

    const products = await ctx.db
      .query("products")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const inventoryRows = products.map((p) => ({
      id: p._id,
      sku: p.sku,
      name: p.name,
      category: p.category,
      stock: p.stock,
      minStock: p.minStock,
      unit: p.unit,
      costCents: p.costCents,
      priceCents: p.priceCents,
      costValueCents: p.costCents * p.stock,
      retailValueCents: p.priceCents * p.stock,
      marginPercent: p.priceCents > 0 ? ((p.priceCents - p.costCents) / p.priceCents) * 100 : 0,
      lowStock: p.stock <= p.minStock,
      active: p.active,
    }));

    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const membershipRows = [];
    for (const m of memberships) {
      const [client, plan] = await Promise.all([ctx.db.get(m.clientId), ctx.db.get(m.planId)]);
      membershipRows.push({
        ...m,
        clientName: client?.name ?? "—",
        planName: plan?.name ?? "—",
        creditsRemaining: Math.max(0, m.creditsTotal - m.creditsUsed),
      });
    }

    const clientPackages = await ctx.db
      .query("clientPackages")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const packageRows = [];
    for (const cp of clientPackages) {
      const [client, pkg] = await Promise.all([ctx.db.get(cp.clientId), ctx.db.get(cp.packageId)]);
      packageRows.push({
        ...cp,
        clientName: client?.name ?? "—",
        packageName: pkg?.name ?? "—",
        creditsRemaining: Math.max(0, cp.creditsTotal - cp.creditsUsed),
      });
    }

    const clients = await ctx.db
      .query("clients")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const clientValue = new Map<string, number>();
    for (const row of saleRows) {
      if (!row.clientId) continue;
      clientValue.set(row.clientId, (clientValue.get(row.clientId) ?? 0) + row.paidCents);
    }
    const clientRows = clients
      .map((c) => ({
        id: c._id,
        name: c.name,
        phone: c.phone,
        status: c.status,
        totalVisits: c.totalVisits,
        totalSpentCents: c.totalSpentCents,
        lastVisitDate: c.lastVisitDate,
        periodSpendCents: clientValue.get(c._id as string) ?? 0,
        tags: c.tags,
      }))
      .sort((a, b) => b.periodSpendCents - a.periodSpendCents);

    /* ------------------------- agregados financeiros ------------------------- */
    const revenueCents = saleRows.reduce((s, r) => s + r.paidCents, 0);
    const byKind = (kind: string) =>
      saleRows.reduce(
        (s, r) =>
          s + r.items.filter((i) => i.kind === kind).reduce((a, i) => a + i.totalCents - i.coveredByCreditCents, 0),
        0,
      );
    const serviceRevenue = byKind("servico");
    const productRevenue = byKind("produto");
    const packageRevenue = byKind("pacote");
    const membershipRevenue = byKind("plano");
    const productCost = saleRows.reduce(
      (s, r) => s + r.items.filter((i) => i.kind === "produto").reduce((a, i) => a + i.costCents, 0),
      0,
    );
    const expensesCents = expenses.reduce((s, e) => s + e.amountCents, 0);
    const commissionsPaidCents = commissions
      .filter((c) => c.status === "paga")
      .reduce((s, c) => s + c.amountCents, 0);
    const commissionsAccruedCents = commissions.reduce((s, c) => s + c.amountCents, 0);
    const grossProfit = revenueCents - productCost - commissionsAccruedCents;
    const netProfit = revenueCents - expensesCents;

    const expensesByCategoryMap = new Map<string, number>();
    for (const e of expenses)
      expensesByCategoryMap.set(e.category, (expensesByCategoryMap.get(e.category) ?? 0) + e.amountCents);

    const revenueByDayMap = new Map<string, number>();
    for (const r of saleRows)
      revenueByDayMap.set(r.date, (revenueByDayMap.get(r.date) ?? 0) + r.paidCents);

    const revenueByBarberMap = new Map<string, { name: string; revenue: number; completed: number; noShow: number; cancelled: number; scheduled: number }>();
    for (const r of saleRows) {
      if (!r.barberId) continue;
      const key = r.barberId;
      const entry = revenueByBarberMap.get(key) ?? {
        name: r.barberName,
        revenue: 0,
        completed: 0,
        noShow: 0,
        cancelled: 0,
        scheduled: 0,
      };
      entry.revenue += r.paidCents;
      revenueByBarberMap.set(key, entry);
    }
    for (const a of appointmentRows) {
      const key = a.barberId as string;
      const entry = revenueByBarberMap.get(key);
      if (!entry) continue;
      if (a.status === "concluido") entry.completed += 1;
      if (a.status === "falta") entry.noShow += 1;
      if (a.status === "cancelado") entry.cancelled += 1;
      if (a.status === "agendado" || a.status === "confirmado") entry.scheduled += 1;
    }

    const revenueByServiceMap = new Map<string, { name: string; revenue: number; count: number }>();
    for (const r of saleRows) {
      for (const item of r.items) {
        if (item.kind !== "servico") continue;
        const entry = revenueByServiceMap.get(item.name) ?? { name: item.name, revenue: 0, count: 0 };
        entry.revenue += item.totalCents - item.coveredByCreditCents;
        entry.count += item.quantity;
        revenueByServiceMap.set(item.name, entry);
      }
    }

    const revenueByMethodMap = new Map<string, number>();
    for (const r of saleRows) {
      for (const p of r.payments) {
        if (!MONEY.has(p.method)) continue;
        revenueByMethodMap.set(p.method, (revenueByMethodMap.get(p.method) ?? 0) + p.amountCents);
      }
    }

    const paidInvoices = saleRows.filter((r) => r.paidCents > 0);
    const returningClients = new Set(
      saleRows.filter((r) => r.clientId).map((r) => r.clientId as string),
    ).size;

    return {
      period: { from: args.from, to: args.to },
      org: { name: org.name, isDemo: org.isDemo },
      summary: {
        revenueCents,
        serviceRevenue,
        productRevenue,
        packageRevenue,
        membershipRevenue,
        productCost,
        productMarginCents: productRevenue - productCost,
        expensesCents,
        commissionsPaidCents,
        commissionsAccruedCents,
        grossProfit,
        netProfit,
        profitMargin: revenueCents > 0 ? Math.round((netProfit / revenueCents) * 100) : 0,
        averageTicket: paidInvoices.length > 0 ? Math.round(revenueCents / paidInvoices.length) : 0,
        salesCount: saleRows.length,
        appointmentsCount: appointments.length,
        completedCount: appointmentRows.filter((a) => a.status === "concluido").length,
        noShowCount: appointmentRows.filter((a) => a.status === "falta").length,
        cancelledCount: appointmentRows.filter((a) => a.status === "cancelado").length,
        costPerService:
          appointmentRows.filter((a) => a.status === "concluido").length > 0
            ? Math.round((productCost + commissionsAccruedCents) / appointmentRows.filter((a) => a.status === "concluido").length)
            : 0,
        activeMemberships: memberships.filter((m) => m.status === "ativa").length,
        mrrCents: memberships.filter((m) => m.status === "ativa").reduce((s, m) => s + m.priceCents, 0),
        inventoryCostValue: inventoryRows.reduce((s, p) => s + p.costValueCents, 0),
        inventoryRetailValue: inventoryRows.reduce((s, p) => s + p.retailValueCents, 0),
        activeClients: clients.filter((c) => c.status === "ativo").length,
        clientsInPeriod: returningClients,
      },
      sales: saleRows,
      appointments: appointmentRows,
      expenses,
      commissions: commissionRows,
      inventory: inventoryRows,
      memberships: membershipRows,
      packages: packageRows,
      clients: clientRows,
      aggregates: {
        revenueByDay: [...revenueByDayMap.entries()]
          .map(([date, cents]) => ({ date, cents }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        revenueByBarber: [...revenueByBarberMap.entries()]
          .map(([barberId, v]) => ({ barberId, ...v }))
          .sort((a, b) => b.revenue - a.revenue),
        revenueByService: [...revenueByServiceMap.values()].sort((a, b) => b.revenue - a.revenue),
        revenueByMethod: [...revenueByMethodMap.entries()].map(([method, cents]) => ({ method, cents })),
        expensesByCategory: [...expensesByCategoryMap.entries()]
          .map(([category, cents]) => ({ category, cents }))
          .sort((a, b) => b.cents - a.cents),
      },
    };
  },
});