import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireView } from "./lib";
import { addDaysISO, daysBetween, monthOffsetISO, monthRange, todayISO } from "../lib/dates";

type SaleRow = {
  sale: Doc<"sales">;
  items: Doc<"saleItems">[];
  payments: Doc<"payments">[];
};

type MoneyMethods = "dinheiro" | "debito" | "credito" | "pix";

/**
 * Painel de controle: TODOS os números vêm de registros reais do banco.
 * Receita = pagamentos em dinheiro/cartão/PIX (créditos de pacote/assinatura
 * não entram de novo na receita, pois já foram reconhecidos na venda do pacote).
 */
export const dashboard = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { org } = await requireView(ctx, args.organizationId, "dashboard");
    const today = todayISO();
    const month = monthRange(today);
    const prevMonth = monthRange(monthOffsetISO(today, -1));
    const money = new Set<string>(["dinheiro", "debito", "credito", "pix"]);

    const allSales = await ctx.db
      .query("sales")
      .withIndex("by_org_date", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .take(600);
    const sales = [...allSales].reverse();

    // itens + pagamentos de cada venda
    const saleData: SaleRow[] = [];
    for (const sale of sales) {
      const [items, payments] = await Promise.all([
        ctx.db.query("saleItems").withIndex("by_sale", (q) => q.eq("saleId", sale._id)).collect(),
        ctx.db.query("payments").withIndex("by_sale", (q) => q.eq("saleId", sale._id)).collect(),
      ]);
      saleData.push({ sale, items, payments });
    }

    const inRange = (date: string, from: string, to: string) => date >= from && date <= to;
    const sumPayments = (rows: SaleRow[]) =>
      rows.reduce(
        (s, r) => s + r.payments.filter((p) => money.has(p.method)).reduce((a, p) => a + p.amountCents, 0),
        0,
      );
    const itemRevenue = (rows: SaleRow[], kind: string) =>
      rows.reduce(
        (s, r) =>
          s + r.items.filter((i) => i.kind === kind).reduce((a, i) => a + i.totalCents - i.coveredByCreditCents, 0),
        0,
      );

    const todayRows = saleData.filter((r) => r.sale.date === today);
    const monthRows = saleData.filter((r) => inRange(r.sale.date, month.start, month.end));
    const prevRows = saleData.filter((r) => inRange(r.sale.date, prevMonth.start, prevMonth.end));

    const revenueToday = sumPayments(todayRows);
    const revenueMonth = sumPayments(monthRows);
    const revenuePrev = sumPayments(prevRows);
    const delta = revenuePrev > 0 ? Math.round(((revenueMonth - revenuePrev) / revenuePrev) * 100) : null;

    /* ---------------------- agenda de hoje ---------------------- */
    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_org_date", (q) => q.eq("organizationId", args.organizationId).eq("date", today))
      .collect();
    appointments.sort((a, b) => a.startTime.localeCompare(b.startTime));
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    const upcoming = appointments
      .filter((a) => a.status === "agendado" || a.status === "confirmado")
      .slice(0, 8);

    const upcomingDetail = [];
    for (const a of upcoming) {
      const [client, barber, service] = await Promise.all([
        ctx.db.get(a.clientId),
        ctx.db.get(a.barberId),
        ctx.db.get(a.serviceId),
      ]);
      const startMin = Number(a.startTime.slice(0, 2)) * 60 + Number(a.startTime.slice(3));
      upcomingDetail.push({
        id: a._id,
        time: a.startTime,
        clientName: client?.name ?? "—",
        barberName: barber?.name ?? "—",
        barberColor: barber?.color ?? "#64748b",
        serviceName: service?.name ?? "—",
        priceCents: a.priceCents,
        status: a.status,
        startingSoon: startMin - nowMinutes <= 60 && startMin >= nowMinutes,
      });
    }

    /* ---------------------- despesas ---------------------- */
    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_org_date", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const expensesMonth = expenses.filter((e) => inRange(e.date, month.start, month.end));
    const expensesMonthTotal = expensesMonth.reduce((s, e) => s + e.amountCents, 0);
    const expensesPrevTotal = expenses
      .filter((e) => inRange(e.date, prevMonth.start, prevMonth.end))
      .reduce((s, e) => s + e.amountCents, 0);

    const expensesByCategory = new Map<string, number>();
    for (const e of expensesMonth)
      expensesByCategory.set(e.category, (expensesByCategory.get(e.category) ?? 0) + e.amountCents);

    /* ---------------------- comissões ---------------------- */
    const commissions = await ctx.db
      .query("commissions")
      .withIndex("by_org_date", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const commissionsMonth = commissions.filter((c) => inRange(c.date, month.start, month.end));
    const commissionsPaid = commissions
      .filter((c) => c.status === "paga" && inRange(c.date, month.start, month.end))
      .reduce((s, c) => s + c.amountCents, 0);
    const commissionsPending = commissions
      .filter((c) => c.status !== "paga")
      .reduce((s, c) => s + c.amountCents, 0);

    /* ---------------------- produtos / estoque ---------------------- */
    const products = await ctx.db
      .query("products")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const activeProducts = products.filter((p) => p.active);
    const lowStock = activeProducts
      .filter((p) => p.stock <= p.minStock)
      .sort((a, b) => a.stock - b.stock)
      .map((p) => ({ id: p._id, name: p.name, stock: p.stock, minStock: p.minStock, unit: p.unit, priceCents: p.priceCents }));
    const inventoryCost = products.reduce((s, p) => s + p.costCents * p.stock, 0);
    const inventoryRetail = products.reduce((s, p) => s + p.priceCents * p.stock, 0);

    const productCostMonth = monthRows.reduce(
      (s, r) => s + r.items.filter((i) => i.kind === "produto").reduce((a, i) => a + i.costCents, 0),
      0,
    );
    const productRevenueMonth = itemRevenue(monthRows, "produto");
    const serviceRevenueMonth = itemRevenue(monthRows, "servico");
    const membershipRevenueMonth = itemRevenue(monthRows, "plano");
    const packageRevenueMonth = itemRevenue(monthRows, "pacote");

    const grossProfit =
      revenueMonth - productCostMonth - commissionsPaid;

    const netProfit =
      grossProfit - expensesMonthTotal;

    /* ---------------------- assinaturas ---------------------- */
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const activeMemberships = memberships.filter((m) => m.status === "ativa");
    const mrr = activeMemberships.reduce((s, m) => s + m.priceCents, 0);
    const renewalsSoon = [];
    for (const m of memberships) {
      const days = daysBetween(today, m.renewalDate);
      if (m.status === "ativa" && days <= 7) {
        const client = await ctx.db.get(m.clientId);
        renewalsSoon.push({
          id: m._id,
          clientName: client?.name ?? "—",
          clientPhone: client?.phone ?? "",
          renewalDate: m.renewalDate,
          priceCents: m.priceCents,
          days,
        });
      }
    }
    renewalsSoon.sort((a, b) => a.days - b.days);

    /* ---------------------- caixa ---------------------- */
    const openSession = await ctx.db
      .query("cashSessions")
      .withIndex("by_org_status", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "aberto"),
      )
      .first();
    let openSessionInfo = null;
    if (openSession) {
      const movements = await ctx.db
        .query("cashMovements")
        .withIndex("by_session", (q) => q.eq("sessionId", openSession._id))
        .collect();
      const expected =
        openSession.openingBalanceCents +
        movements.reduce((s, m) => s + (m.type === "venda" || m.type === "entrada" ? m.amountCents : -m.amountCents), 0);
      openSessionInfo = {
        id: openSession._id,
        openedAt: openSession.openedAt,
        expectedCents: expected,
        movements: movements.length,
      };
    }
    const closedSessions = await ctx.db
      .query("cashSessions")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const lastClosed = closedSessions
      .filter((s) => s.status === "fechado")
      .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))[0];

    const todayByMethod = { dinheiro: 0, debito: 0, credito: 0, pix: 0 } as Record<MoneyMethods, number>;
    for (const row of todayRows) {
      for (const p of row.payments) {
        if (money.has(p.method)) todayByMethod[p.method] += p.amountCents;
      }
    }
    const monthByMethod = { dinheiro: 0, debito: 0, credito: 0, pix: 0 } as Record<MoneyMethods, number>;
    for (const row of monthRows) {
      for (const p of row.payments) {
        if (money.has(p.method)) monthByMethod[p.method] += p.amountCents;
      }
    }

    /* ---------------------- CRM / fidelidade ---------------------- */
    const clients = await ctx.db
      .query("clients")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const inactiveClients = clients.filter(
      (c) => c.status === "ativo" && c.lastVisitDate && daysBetween(c.lastVisitDate, today) > org.settings.inactivityDays,
    );
    const followups = await ctx.db
      .query("followups")
      .withIndex("by_org_status", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const pendingFollowups = followups.filter((f) => f.status === "pendente" || f.status === "em_andamento");
    const overdueFollowups = pendingFollowups.filter((f) => f.dueDate < today);
    const birthdaysSoon = clients
      .filter((c) => c.birthDate && c.status === "ativo")
      .map((c) => {
        const diff = daysBetween(today.slice(0, 5), c.birthDate!.slice(0, 5));
        const next = new Date(`${today.slice(0, 4)}-${c.birthDate!.slice(5)}T00:00:00Z`);
        const days = Math.round(
          (next.getTime() - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
        );
        return { name: c.name, id: c._id, days: days >= 0 ? days : days + 365, phone: c.phone, unused: diff };
      })
      .filter((b) => b.days <= 7)
      .sort((a, b) => a.days - b.days);

    const feedbackRows = await ctx.db
      .query("feedback")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const feedbackMonth = feedbackRows.filter((f) => inRange(f.date, month.start, month.end));
    const avgRating = feedbackMonth.length
      ? feedbackMonth.reduce((s, f) => s + f.rating, 0) / feedbackMonth.length
      : null;

    /* ---------------------- gráficos ---------------------- */
    const last14 = Array.from({ length: 14 }, (_, i) => addDaysISO(today, i - 13));
    const revenueByDay = last14.map((date) => ({
      date,
      label: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
      value: sumPayments(saleData.filter((r) => r.sale.date === date)),
    }));

    const last6Months = Array.from({ length: 6 }, (_, i) => monthRange(monthOffsetISO(today, i - 5)));
    const revenueByMonth = last6Months.map((m) => ({
      month: `${m.start.slice(0, 7)}`,
      label: `${m.start.slice(5, 7)}/${m.start.slice(2, 4)}`,
      revenue: sumPayments(saleData.filter((r) => inRange(r.sale.date, m.start, m.end))),
      expenses: expenses.filter((e) => inRange(e.date, m.start, m.end)).reduce((s, e) => s + e.amountCents, 0),
    }));

    const byBarberMap = new Map<string, { name: string; color: string; value: number; appointments: number; completed: number; noShow: number }>();
    const monthBarberSales = monthRows.filter((r) => r.sale.barberId);
    for (const row of monthBarberSales) {
      const key = row.sale.barberId as string;
      const barber = await ctx.db.get(row.sale.barberId!);
      const entry = byBarberMap.get(key) ?? {
        name: barber?.name ?? "—",
        color: barber?.color ?? "#64748b",
        value: 0,
        appointments: 0,
        completed: 0,
        noShow: 0,
      };
      entry.value += row.payments.filter((p) => money.has(p.method)).reduce((a, p) => a + p.amountCents, 0);
      byBarberMap.set(key, entry);
    }
    const monthAppointments = await ctx.db
      .query("appointments")
      .withIndex("by_org_date", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    for (const a of monthAppointments) {
      if (!inRange(a.date, month.start, month.end)) continue;
      const key = a.barberId as string;
      const entry = byBarberMap.get(key);
      if (!entry) continue;
      entry.appointments += 1;
      if (a.status === "concluido") entry.completed += 1;
      if (a.status === "falta") entry.noShow += 1;
    }
    const revenueByBarber = [...byBarberMap.values()].sort((a, b) => b.value - a.value);

    const byServiceMap = new Map<string, { name: string; value: number; count: number }>();
    for (const row of monthRows) {
      for (const item of row.items) {
        if (item.kind !== "servico") continue;
        const entry = byServiceMap.get(item.name) ?? { name: item.name, value: 0, count: 0 };
        entry.value += item.totalCents - item.coveredByCreditCents;
        entry.count += item.quantity;
        byServiceMap.set(item.name, entry);
      }
    }
    const revenueByService = [...byServiceMap.values()].sort((a, b) => b.value - a.value).slice(0, 8);

    const revenueByMethod = (Object.keys(monthByMethod) as MoneyMethods[]).map((method) => ({
      method,
      value: monthByMethod[method],
    }));

    const appointmentsTrend = last14.map((date) => {
      const rows = monthAppointments.filter((a) => a.date === date);
      return {
        date,
        label: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
        total: rows.length,
        concluidos: rows.filter((a) => a.status === "concluido").length,
        faltas: rows.filter((a) => a.status === "falta").length,
        cancelados: rows.filter((a) => a.status === "cancelado").length,
      };
    });

    const retention = last6Months.map((m) => {
      const monthSales = saleData.filter((r) => inRange(r.sale.date, m.start, m.end));
      const ids = new Set(monthSales.map((r) => r.sale.clientId).filter(Boolean) as string[]);
      let novos = 0;
      let recorrentes = 0;
      for (const id of ids) {
        const client = clients.find((c) => c._id === id);
        const createdMonth = client
          ? `${new Date(client.createdAt).toISOString().slice(0, 7)}`
          : "";
        if (createdMonth === `${m.start.slice(0, 7)}`) novos += 1;
        else recorrentes += 1;
      }
      return { label: `${m.start.slice(5, 7)}/${m.start.slice(2, 4)}`, novos, recorrentes };
    });

    const productSalesMap = new Map<string, { name: string; quantity: number; revenue: number; cost: number }>();
    for (const row of last6Months.flatMap((m) => saleData.filter((r) => inRange(r.sale.date, m.start, m.end)))) {
      for (const item of row.items) {
        if (item.kind !== "produto") continue;
        const entry = productSalesMap.get(item.name) ?? { name: item.name, quantity: 0, revenue: 0, cost: 0 };
        entry.quantity += item.quantity;
        entry.revenue += item.totalCents - item.coveredByCreditCents;
        entry.cost += item.costCents;
        productSalesMap.set(item.name, entry);
      }
    }
    const productSales = [...productSalesMap.values()]
      .map((p) => ({ ...p, marginCents: p.revenue - p.cost }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    const membershipRevenueTrend = last6Months.map((m) => ({
      label: `${m.start.slice(5, 7)}/${m.start.slice(2, 4)}`,
      value: itemRevenue(saleData.filter((r) => inRange(r.sale.date, m.start, m.end)), "plano"),
    }));

    const profitTrend = last6Months.map((m) => {
      const revenue = sumPayments(saleData.filter((r) => inRange(r.sale.date, m.start, m.end)));
      const exp = expenses.filter((e) => inRange(e.date, m.start, m.end)).reduce((s, e) => s + e.amountCents, 0);
      return { label: `${m.start.slice(5, 7)}/${m.start.slice(2, 4)}`, revenue, expenses: exp, profit: revenue - exp };
    });

    /* ---------------------- precisa de atenção ---------------------- */
    const attention: Array<{
      key: string;
      title: string;
      detail: string;
      link: string;
      severity: "info" | "alerta" | "critico";
      count: number;
    }> = [];

    const startingSoon = upcomingDetail.filter((u) => u.startingSoon).length;
    if (startingSoon > 0)
      attention.push({
        key: "agenda",
        title: "Atendimentos começando em breve",
        detail: `${startingSoon} atendimento(s) nas próximas horas.`,
        link: "/app/agenda",
        severity: "info",
        count: startingSoon,
      });
    const pendingToday = appointments.filter((a) => a.status === "agendado" || a.status === "confirmado").length;
    if (pendingToday > 0)
      attention.push({
        key: "pendentes_hoje",
        title: "Agendamentos pendentes hoje",
        detail: `${pendingToday} cliente(s) aguardando atendimento.`,
        link: "/app/agenda",
        severity: "info",
        count: pendingToday,
      });
    if (lowStock.length > 0)
      attention.push({
        key: "estoque",
        title: "Produtos abaixo do estoque mínimo",
        detail: lowStock
          .slice(0, 3)
          .map((p) => `${p.name} (${p.stock}/${p.minStock})`)
          .join(", "),
        link: "/app/estoque",
        severity: lowStock.some((p) => p.stock <= 0) ? "critico" : "alerta",
        count: lowStock.length,
      });
    if (overdueFollowups.length > 0)
      attention.push({
        key: "followups",
        title: "Follow-ups atrasados",
        detail: `${overdueFollowups.length} tarefa(s) de relacionamento com prazo vencido.`,
        link: "/app/relacionamento",
        severity: "alerta",
        count: overdueFollowups.length,
      });
    if (renewalsSoon.length > 0)
      attention.push({
        key: "renovacoes",
        title: "Assinaturas a renovar",
        detail: `${renewalsSoon.length} renovação(ões) nos próximos 7 dias.`,
        link: "/app/assinaturas",
        severity: "info",
        count: renewalsSoon.length,
      });
    if (commissionsPending > 0)
      attention.push({
        key: "comissoes",
        title: "Comissões a pagar",
        detail: `R$ ${(commissionsPending / 100).toFixed(2)} pendentes de aprovação/pagamento.`,
        link: "/app/comissoes",
        severity: "alerta",
        count: commissions.filter((c) => c.status !== "paga").length,
      });
    if (inactiveClients.length > 0)
      attention.push({
        key: "inatividade",
        title: "Clientes inativos",
        detail: `${inactiveClients.length} cliente(s) sem atendimento há mais de ${org.settings.inactivityDays} dias.`,
        link: "/app/clientes",
        severity: "info",
        count: inactiveClients.length,
      });
    if (lastClosed && lastClosed.varianceCents && lastClosed.varianceCents !== 0)
      attention.push({
        key: "caixa",
        title: "Divergência no último fechamento",
        detail: `Diferença de R$ ${(lastClosed.varianceCents / 100).toFixed(2)} em ${lastClosed.openedDate}.`,
        link: "/app/caixa",
        severity: "alerta",
        count: 1,
      });
    if (birthdaysSoon.length > 0)
      attention.push({
        key: "aniversarios",
        title: "Aniversários nesta semana",
        detail: birthdaysSoon
          .slice(0, 3)
          .map((b) => `${b.name} (${b.days === 0 ? "hoje" : `${b.days}d`})`)
          .join(", "),
        link: "/app/relacionamento",
        severity: "info",
        count: birthdaysSoon.length,
      });
    const noShowToday = appointments.filter((a) => a.status === "falta").length;
    if (noShowToday > 0)
      attention.push({
        key: "faltas",
        title: "Faltas registradas hoje",
        detail: `${noShowToday} cliente(s) não compareceram.`,
        link: "/app/agenda",
        severity: "alerta",
        count: noShowToday,
      });

    const completedToday = appointments.filter((a) => a.status === "concluido").length;
    const cancelledToday = appointments.filter((a) => a.status === "cancelado").length;
    const noShowTotal = appointments.filter((a) => a.status === "falta").length;
    const clientsServedToday = new Set(
      appointments.filter((a) => a.status === "concluido").map((a) => a.clientId as string),
    ).size;
    const avgTicket = monthRows.length > 0 ? Math.round(revenueMonth / monthRows.length) : 0;

    return {
      today,
      month: `${month.start.slice(0, 7)}`,
      kpis: {
        revenueToday,
        revenueMonth,
        revenuePrev,
        deltaPercent: delta,
        expensesMonth: expensesMonthTotal,
        expensesPrev: expensesPrevTotal,
        grossProfit,
        netProfit,
        profitMargin: revenueMonth > 0 ? Math.round((netProfit / revenueMonth) * 100) : 0,
        averageTicket: avgTicket,
        serviceRevenueMonth,
        productRevenueMonth,
        membershipRevenueMonth,
        packageRevenueMonth,
        productCostMonth,
        salesCountMonth: monthRows.length,
        salesCountToday: todayRows.length,
        clientsServedToday,
        appointmentsToday: appointments.length,
        completedToday,
        cancelledToday,
        noShowToday,
        noShowRate:
          appointments.length > 0 ? Math.round((noShowTotal / appointments.length) * 100) : 0,
        completionRate:
          appointments.length > 0 ? Math.round((completedToday / appointments.length) * 100) : 0,
        activeMemberships: activeMemberships.length,
        mrr,
        renewalsSoon: renewalsSoon.length,
        pendingCommissionsCents: commissionsPending,
        paidCommissionsCents: commissionsPaid,
        lowStockCount: lowStock.length,
        inventoryCostCents: inventoryCost,
        inventoryRetailCents: inventoryRetail,
        pendingFollowups: pendingFollowups.length,
        overdueFollowups: overdueFollowups.length,
        inactiveClients: inactiveClients.length,
        activeClients: clients.filter((c) => c.status === "ativo").length,
        avgRating,
        feedbackCount: feedbackMonth.length,
      },
      agenda: {
        upcoming: upcomingDetail,
        openSession: openSessionInfo,
        lastClosedSession: lastClosed ?? null,
      },
      attention,
      charts: {
        revenueByDay,
        revenueByMonth,
        revenueByBarber,
        revenueByService,
        revenueByMethod,
        expensesByCategory: [...expensesByCategory.entries()]
          .map(([category, cents]) => ({ category, cents }))
          .sort((a, b) => b.cents - a.cents),
        profitTrend,
        appointmentsTrend,
        retention,
        productSales,
        membershipRevenueTrend,
      },
      todayByMethod,
      monthByMethod,
      renewalsSoon: renewalsSoon.slice(0, 6),
      lowStock: lowStock.slice(0, 6),
      birthdaysSoon: birthdaysSoon.slice(0, 5),
      isDemo: org.isDemo,
    };
  },
});