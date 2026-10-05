import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { audit, bad, notify, requireManage, requireView } from "./lib";
import { todayISO } from "../lib/dates";

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    barberId: v.optional(v.id("barbers")),
    status: v.optional(v.union(v.literal("pendente"), v.literal("aprovada"), v.literal("paga"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireView(ctx, args.organizationId, "commissions");
    const rows = await ctx.db
      .query("commissions")
      .withIndex("by_org_date", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const filtered = rows
      .filter((c) => (args.from ? c.date >= args.from : true))
      .filter((c) => (args.to ? c.date <= args.to : true))
      .filter((c) => (args.barberId ? c.barberId === args.barberId : true))
      .filter((c) => (args.status ? c.status === args.status : true))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

    const barberNames = new Map<string, string>();
    const out = [];
    for (const c of filtered.slice(0, args.limit ?? 300)) {
      let name = barberNames.get(c.barberId);
      if (!name) {
        const barber = await ctx.db.get(c.barberId);
        name = barber?.name ?? "—";
        barberNames.set(c.barberId, name);
      }
      out.push({
        ...c,
        barberName: name,
        modelLabel: c.model === "percentual" ? `${c.ratePercent ?? 0}%` : "Fixo",
      });
    }

    const all = rows
      .filter((c) => (args.from ? c.date >= args.from : true))
      .filter((c) => (args.to ? c.date <= args.to : true))
      .filter((c) => (args.barberId ? c.barberId === args.barberId : true));

    return {
      commissions: out,
      totals: {
        pendente: all.filter((c) => c.status === "pendente").reduce((s, c) => s + c.amountCents, 0),
        aprovada: all.filter((c) => c.status === "aprovada").reduce((s, c) => s + c.amountCents, 0),
        paga: all.filter((c) => c.status === "paga").reduce((s, c) => s + c.amountCents, 0),
        total: all.reduce((s, c) => s + c.amountCents, 0),
      },
    };
  },
});

export const approve = mutation({
  args: {
    organizationId: v.id("organizations"),
    commissionId: v.id("commissions"),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "commissions");
    const c = await ctx.db.get(args.commissionId);
    if (!c || c.organizationId !== org._id) bad("Comissão não encontrada.");
    if (c.status === "paga") bad("Comissão já paga.");
    await ctx.db.patch(c._id, { status: "aprovada" });
    await audit(ctx, org._id, userId, {
      action: "aprovou",
      module: "Comissões",
      recordType: "commissions",
      recordId: c._id,
      summary: `Comissão aprovada (${c.description})`,
    });
  },
});

export const pay = mutation({
  args: {
    organizationId: v.id("organizations"),
    commissionId: v.id("commissions"),
    paidDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "commissions");
    const c = await ctx.db.get(args.commissionId);
    if (!c || c.organizationId !== org._id) bad("Comissão não encontrada.");
    if (c.status === "paga") bad("Comissão já paga.");
    const barber = await ctx.db.get(c.barberId);
    await ctx.db.patch(c._id, { status: "paga", paidDate: args.paidDate ?? todayISO() });
    await audit(ctx, org._id, userId, {
      action: "pagou",
      module: "Comissões",
      recordType: "commissions",
      recordId: c._id,
      summary: `Comissão paga a ${barber?.name ?? "barbeiro"} — R$ ${(c.amountCents / 100).toFixed(2)}`,
    });
    await notify(ctx, org._id, {
      type: "comissao_paga",
      title: "Comissão paga",
      message: `${barber?.name ?? "Barbeiro"} — R$ ${(c.amountCents / 100).toFixed(2)} pago em ${args.paidDate ?? todayISO()}.`,
      severity: "info",
      dedupKey: `comissao_paga:${c._id}`,
      link: "/app/comissoes",
    });
  },
});

/** Marca todas as comissões aprovadas de um barbeiro/período como pagas. */
export const payPeriod = mutation({
  args: {
    organizationId: v.id("organizations"),
    barberId: v.id("barbers"),
    from: v.string(),
    to: v.string(),
    paidDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "commissions");
    const rows = await ctx.db
      .query("commissions")
      .withIndex("by_org_date", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const targets = rows.filter(
      (c) =>
        c.barberId === args.barberId &&
        c.date >= args.from &&
        c.date <= args.to &&
        c.status !== "paga",
    );
    if (targets.length === 0) bad("Nenhuma comissão pendente no período selecionado.");
    const date = args.paidDate ?? todayISO();
    let total = 0;
    for (const c of targets) {
      await ctx.db.patch(c._id, { status: "paga", paidDate: date });
      total += c.amountCents;
    }
    const barber = await ctx.db.get(args.barberId);
    await audit(ctx, org._id, userId, {
      action: "pagou",
      module: "Comissões",
      recordType: "commissions",
      summary: `${targets.length} comissões de ${barber?.name ?? "barbeiro"} pagas — R$ ${(total / 100).toFixed(2)}`,
    });
    return { count: targets.length, total };
  },
});

export const statements = query({
  args: {
    organizationId: v.id("organizations"),
    from: v.string(),
    to: v.string(),
  },
  handler: async (ctx, args) => {
    await requireView(ctx, args.organizationId, "commissions");
    const rows = await ctx.db
      .query("commissions")
      .withIndex("by_org_date", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const inRange = rows.filter((c) => c.date >= args.from && c.date <= args.to);
    const byBarber = new Map<string, { amount: number; count: number; paid: number }>();
    for (const c of inRange) {
      const key = c.barberId as string;
      const entry = byBarber.get(key) ?? { amount: 0, count: 0, paid: 0 };
      entry.amount += c.amountCents;
      entry.count += 1;
      if (c.status === "paga") entry.paid += c.amountCents;
      byBarber.set(key, entry);
    }
    const out = [];
    for (const [barberId, entry] of byBarber) {
      const barber = await ctx.db.get(barberId as Id<"barbers">);
      out.push({
        barberId,
        barberName: barber?.name ?? "—",
        commissionModel: barber?.commissionModel ?? "herdar",
        commissionValue: barber?.commissionValue ?? null,
        totalCents: entry.amount,
        count: entry.count,
        paidCents: entry.paid,
        pendingCents: entry.amount - entry.paid,
      });
    }
    return out.sort((a, b) => b.totalCents - a.totalCents);
  },
});