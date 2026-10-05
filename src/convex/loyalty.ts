import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { audit, bad, ensureLoyaltyAccount, requireManage, requireView } from "./lib";
import { todayISO } from "../lib/dates";

export const accounts = query({
  args: {
    organizationId: v.id("organizations"),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { org } = await requireView(ctx, args.organizationId, "loyalty");
    const rows = await ctx.db
      .query("loyaltyAccounts")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const term = (args.search ?? "").trim().toLowerCase();
    const out = [];
    for (const row of rows) {
      const client = await ctx.db.get(row.clientId);
      if (!client) continue;
      if (term && !client.name.toLowerCase().includes(term)) continue;
      out.push({ ...row, clientName: client.name, clientPhone: client.phone });
    }
    return {
      accounts: out.sort((a, b) => b.points - a.points).slice(0, args.limit ?? 200),
      settings: org.settings,
      totalPoints: out.reduce((s, a) => s + a.points, 0),
      totalClients: out.length,
    };
  },
});

export const transactions = query({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args) => {
    await requireView(ctx, args.organizationId, "loyalty");
    const rows = await ctx.db
      .query("loyaltyTransactions")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const filtered = rows
      .filter((t) => (args.clientId ? t.clientId === args.clientId : true))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 200);
    const out = [];
    for (const t of filtered) {
      const client = await ctx.db.get(t.clientId);
      out.push({ ...t, clientName: client?.name ?? "—" });
    }
    return out;
  },
});

export const listRewards = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireView(ctx, args.organizationId, "loyalty");
    return await ctx.db
      .query("loyaltyRewards")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

export const createReward = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    pointsCost: v.number(),
    kind: v.union(v.literal("desconto"), v.literal("servico_gratis"), v.literal("produto")),
    valueCents: v.optional(v.number()),
    serviceId: v.optional(v.id("services")),
    productId: v.optional(v.id("products")),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "loyalty");
    if (!args.name.trim()) bad("Informe o nome da recompensa.");
    if (args.pointsCost <= 0) bad("Informe o custo em pontos.");
    const id = await ctx.db.insert("loyaltyRewards", {
      organizationId: org._id,
      name: args.name.trim(),
      description: args.description,
      pointsCost: args.pointsCost,
      kind: args.kind,
      valueCents: args.valueCents,
      serviceId: args.serviceId,
      productId: args.productId,
      active: true,
      createdAt: Date.now(),
    });
    await audit(ctx, org._id, userId, {
      action: "criou",
      module: "Fidelidade",
      recordType: "loyaltyRewards",
      recordId: id,
      summary: `Recompensa "${args.name}" criada`,
    });
    return id;
  },
});

export const updateReward = mutation({
  args: {
    organizationId: v.id("organizations"),
    rewardId: v.id("loyaltyRewards"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    pointsCost: v.optional(v.number()),
    valueCents: v.optional(v.number()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "loyalty");
    const reward = await ctx.db.get(args.rewardId);
    if (!reward || reward.organizationId !== org._id) bad("Recompensa não encontrada.");
    await ctx.db.patch(reward._id, {
      name: args.name ?? reward.name,
      description: args.description ?? reward.description,
      pointsCost: args.pointsCost ?? reward.pointsCost,
      valueCents: args.valueCents ?? reward.valueCents,
      active: args.active ?? reward.active,
    });
    await audit(ctx, org._id, userId, {
      action: "atualizou",
      module: "Fidelidade",
      recordType: "loyaltyRewards",
      recordId: reward._id,
      summary: `Recompensa "${reward.name}" atualizada`,
    });
  },
});

/** Resgata pontos validando o saldo do cliente. */
export const redeem = mutation({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.id("clients"),
    rewardId: v.id("loyaltyRewards"),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "loyalty");
    const reward = await ctx.db.get(args.rewardId);
    if (!reward || reward.organizationId !== org._id) bad("Recompensa não encontrada.");
    if (!reward.active) bad("Esta recompensa está inativa.");
    const client = await ctx.db.get(args.clientId);
    if (!client || client.organizationId !== org._id) bad("Cliente não encontrado.");
    const account = await ensureLoyaltyAccount(ctx, org._id, args.clientId);
    if (account.points < reward.pointsCost)
      bad(`Saldo insuficiente: o cliente tem ${account.points} pontos e a recompensa custa ${reward.pointsCost}.`);

    await ctx.db.patch(account._id, {
      points: account.points - reward.pointsCost,
      totalRedeemed: account.totalRedeemed + reward.pointsCost,
    });
    await ctx.db.insert("loyaltyTransactions", {
      organizationId: org._id,
      clientId: args.clientId,
      type: "resgate",
      points: -reward.pointsCost,
      reason: `Resgate: ${reward.name}`,
      date: todayISO(),
      createdAt: Date.now(),
    });
    await audit(ctx, org._id, userId, {
      action: "resgatou",
      module: "Fidelidade",
      recordType: "loyaltyAccounts",
      recordId: account._id,
      summary: `${client.name} resgatou "${reward.name}" (${reward.pointsCost} pontos)`,
    });
    return account.points - reward.pointsCost;
  },
});

export const adjustPoints = mutation({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.id("clients"),
    points: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "loyalty");
    if (args.points === 0) bad("Informe uma quantidade de pontos.");
    const account = await ensureLoyaltyAccount(ctx, org._id, args.clientId);
    if (account.points + args.points < 0) bad("O ajuste deixaria o saldo negativo.");
    await ctx.db.patch(account._id, {
      points: account.points + args.points,
      totalEarned: args.points > 0 ? account.totalEarned + args.points : account.totalEarned,
      totalRedeemed: args.points < 0 ? account.totalRedeemed + Math.abs(args.points) : account.totalRedeemed,
    });
    await ctx.db.insert("loyaltyTransactions", {
      organizationId: org._id,
      clientId: args.clientId as Id<"clients">,
      type: "ajuste",
      points: args.points,
      reason: args.reason,
      date: todayISO(),
      createdAt: Date.now(),
    });
    await audit(ctx, org._id, userId, {
      action: "ajustou",
      module: "Fidelidade",
      recordType: "loyaltyAccounts",
      recordId: account._id,
      summary: `Ajuste de ${args.points} pontos`,
    });
  },
});