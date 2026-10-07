import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { audit, bad, notify, requireManage, requireView } from "./lib";
import { dateISO, requiredText, text } from "./validation";
import { todayISO } from "../lib/dates";

/** Saldo de caixa esperado a partir da sessão e seus movimentos. */
function expectedFromMovements(openingCents: number, movements: Array<{ type: string; amountCents: number }>) {
  let total = openingCents;
  for (const m of movements) {
    if (m.type === "venda" || m.type === "entrada") total += m.amountCents;
    else total -= m.amountCents;
  }
  return total;
}

export const currentSession = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { org } = await requireView(ctx, args.organizationId, "cash");
    const session = await ctx.db
      .query("cashSessions")
      .withIndex("by_org_status", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "aberto"),
      )
      .first();
    if (!session) return null;

    const movements = await ctx.db
      .query("cashMovements")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .collect();
    const detailed = [];
    for (const m of movements) {
      const user = await ctx.db.get(m.userId);
      detailed.push({ ...m, userName: user?.name ?? "—" });
    }
    detailed.sort((a, b) => a.createdAt - b.createdAt);

    const sales = await ctx.db
      .query("sales")
      .withIndex("by_org_date", (q) =>
        q.eq("organizationId", args.organizationId).eq("date", todayISO()),
      )
      .collect();
    const byMethod = { dinheiro: 0, debito: 0, credito: 0, pix: 0 } as Record<string, number>;
    for (const sale of sales) {
      const payments = await ctx.db
        .query("payments")
        .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
        .collect();
      for (const p of payments) byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amountCents;
    }

    return {
      session,
      movements: detailed,
      expectedCents: expectedFromMovements(session.openingBalanceCents, movements),
      todayByMethod: byMethod,
      todaySales: sales.length,
      openDays: Math.max(
        1,
        Math.round((Date.now() - session.openedAt) / 86_400_000),
      ),
      lowStockCount: 0,
      orgName: org.name,
    };
  },
});

export const openSession = mutation({
  args: {
    organizationId: v.id("organizations"),
    openingBalanceCents: v.number(),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "cash");
    if (args.openingBalanceCents < 0) bad("O valor de abertura não pode ser negativo.");
    const existing = await ctx.db
      .query("cashSessions")
      .withIndex("by_org_status", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "aberto"),
      )
      .first();
    if (existing) bad("Já existe um caixa aberto. Feche-o antes de abrir outro.");
    const id = await ctx.db.insert("cashSessions", {
      organizationId: org._id,
      openedAt: Date.now(),
      openedDate: todayISO(),
      openingBalanceCents: args.openingBalanceCents,
      status: "aberto",
      openedBy: userId as Id<"users">,
    });
    await audit(ctx, org._id, userId, {
      action: "abriu",
      module: "Caixa",
      recordType: "cashSessions",
      recordId: id,
      summary: `Caixa aberto com R$ ${(args.openingBalanceCents / 100).toFixed(2)}`,
    });
    return id;
  },
});

export const addMovement = mutation({
  args: {
    organizationId: v.id("organizations"),
    type: v.union(v.literal("entrada"), v.literal("saida"), v.literal("retirada")),
    amountCents: v.number(),
    description: v.string(),
    date: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "cash");
    if (args.amountCents <= 0) bad("Informe um valor maior que zero.");
    const session = await ctx.db
      .query("cashSessions")
      .withIndex("by_org_status", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "aberto"),
      )
      .first();
    if (!session) bad("Não há caixa aberto. Abra o caixa para lançar movimentos.");
    const description = requiredText(args.description, "reference", "Descrição");
    const id = await ctx.db.insert("cashMovements", {
      organizationId: org._id,
      sessionId: session._id,
      type: args.type,
      amountCents: args.amountCents,
      description,
      date: args.date ? dateISO(args.date, "Data do movimento") : todayISO(),
      userId: userId as Id<"users">,
      createdAt: Date.now(),
    });
    await audit(ctx, org._id, userId, {
      action: args.type === "entrada" ? "entrada" : "saida",
      module: "Caixa",
      recordType: "cashMovements",
      recordId: id,
      summary: `${args.type === "entrada" ? "Entrada" : "Saída"} de R$ ${(args.amountCents / 100).toFixed(2)} — ${description}`,
    });
    return id;
  },
});

export const closeSession = mutation({
  args: {
    organizationId: v.id("organizations"),
    countedCents: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "cash");
    if (args.countedCents < 0) bad("Informe o valor contado (pode ser zero).");
    const session = await ctx.db
      .query("cashSessions")
      .withIndex("by_org_status", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "aberto"),
      )
      .first();
    if (!session) bad("Não há caixa aberto para fechar.");
    const movements = await ctx.db
      .query("cashMovements")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .collect();
    const expected = expectedFromMovements(session.openingBalanceCents, movements);
    const variance = args.countedCents - expected;

    await ctx.db.patch(session._id, {
      closedAt: Date.now(),
      expectedCents: expected,
      countedCents: args.countedCents,
      varianceCents: variance,
      status: "fechado",
      closedBy: userId as Id<"users">,
      notes: text(args.notes, "note", "Observações do fechamento"),
    });
    await audit(ctx, org._id, userId, {
      action: "fechou",
      module: "Caixa",
      recordType: "cashSessions",
      recordId: session._id,
      summary: `Caixa fechado — esperado R$ ${(expected / 100).toFixed(2)}, contado R$ ${(args.countedCents / 100).toFixed(2)}, diferença R$ ${(variance / 100).toFixed(2)}`,
    });
    if (variance !== 0) {
      await notify(ctx, org._id, {
        type: "caixa_divergencia",
        title: "Divergência no caixa",
        message: `Diferença de R$ ${(variance / 100).toFixed(2)} no fechamento do caixa.`,
        severity: "alerta",
        dedupKey: `caixa_divergencia:${session._id}`,
        link: "/app/caixa",
      });
    }
    return { expected, counted: args.countedCents, variance };
  },
});

export const listSessions = query({
  args: {
    organizationId: v.id("organizations"),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireView(ctx, args.organizationId, "cash");
    const rows = await ctx.db
      .query("cashSessions")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return rows
      .filter((s) => (args.from ? s.openedDate >= args.from : true))
      .filter((s) => (args.to ? s.openedDate <= args.to : true))
      .sort((a, b) => b.openedAt - a.openedAt)
      .slice(0, args.limit ?? 30);
  },
});