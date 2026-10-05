import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { audit, bad, requireManage, requireView } from "./lib";

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    includeInactive: v.optional(v.boolean()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireView(ctx, args.organizationId, "catalog");
    const rows = await ctx.db
      .query("services")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return rows
      .filter((s) => (args.includeInactive ? true : s.active))
      .filter((s) => (args.category ? s.category === args.category : true))
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  },
});

export const categories = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const { org } = await requireView(ctx, organizationId, "catalog");
    return org.settings.serviceCategories;
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    category: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    durationMin: v.number(),
    priceCents: v.number(),
    commissionModel: v.optional(v.union(v.literal("herdar"), v.literal("percentual"), v.literal("fixo"))),
    commissionValue: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "catalog");
    if (!args.name.trim()) bad("Informe o nome do serviço.");
    if (args.durationMin < 5 || args.durationMin > 480) bad("Duração deve estar entre 5 e 480 minutos.");
    if (args.priceCents < 0) bad("Preço inválido.");
    const id = await ctx.db.insert("services", {
      organizationId: org._id,
      category: args.category,
      name: args.name.trim(),
      description: args.description,
      durationMin: args.durationMin,
      priceCents: args.priceCents,
      commissionModel: args.commissionModel ?? "herdar",
      commissionValue: args.commissionValue,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await audit(ctx, org._id, userId, {
      action: "criou",
      module: "Serviços",
      recordType: "services",
      recordId: id,
      summary: `Serviço "${args.name}" cadastrado`,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    serviceId: v.id("services"),
    category: v.optional(v.string()),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    durationMin: v.optional(v.number()),
    priceCents: v.optional(v.number()),
    commissionModel: v.optional(v.union(v.literal("herdar"), v.literal("percentual"), v.literal("fixo"))),
    commissionValue: v.optional(v.number()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "catalog");
    const service = await ctx.db.get(args.serviceId);
    if (!service || service.organizationId !== org._id) bad("Serviço não encontrado.");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const key of [
      "category", "name", "description", "durationMin", "priceCents",
      "commissionModel", "commissionValue", "active",
    ] as const) {
      if (args[key] !== undefined) patch[key] = args[key];
    }
    if (args.durationMin !== undefined && (args.durationMin < 5 || args.durationMin > 480))
      bad("Duração deve estar entre 5 e 480 minutos.");
    await ctx.db.patch(service._id, patch);
    await audit(ctx, org._id, userId, {
      action: "atualizou",
      module: "Serviços",
      recordType: "services",
      recordId: service._id,
      summary: `Serviço "${service.name}" atualizado`,
    });
  },
});

export const remove = mutation({
  args: { organizationId: v.id("organizations"), serviceId: v.id("services") },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "catalog");
    const service = await ctx.db.get(args.serviceId);
    if (!service || service.organizationId !== org._id) bad("Serviço não encontrado.");
    const used = await ctx.db
      .query("appointments")
      .withIndex("by_org_status", (q) => q.eq("organizationId", org._id))
      .first();
    if (used) {
      await ctx.db.patch(service._id, { active: false, updatedAt: Date.now() });
      return;
    }
    await ctx.db.delete(service._id);
    await audit(ctx, org._id, userId, {
      action: "excluiu",
      module: "Serviços",
      recordType: "services",
      summary: `Serviço "${service.name}" excluído`,
    });
  },
});