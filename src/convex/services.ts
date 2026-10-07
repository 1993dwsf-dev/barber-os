import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { audit, bad, requireManage, requireView } from "./lib";
import { requiredText, text } from "./validation";

/** Regra de comissão: percentual precisa estar em 0–100; valor fixo em centavos ≥ 0. */
function assertCommission(
  model: "herdar" | "percentual" | "fixo",
  value: number | undefined,
): void {
  if (model === "herdar") return;
  if (value === undefined || !Number.isFinite(value) || value < 0)
    bad("Informe um valor de comissão válido.");
  if (model === "percentual" && value > 100) bad("O percentual de comissão deve estar entre 0 e 100.");
}

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
    const name = requiredText(args.name, "name", "Nome do serviço");
    if (args.durationMin < 5 || args.durationMin > 480) bad("Duração deve estar entre 5 e 480 minutos.");
    if (args.priceCents < 0) bad("Preço inválido.");
    assertCommission(args.commissionModel ?? "herdar", args.commissionValue);
    const id = await ctx.db.insert("services", {
      organizationId: org._id,
      category: requiredText(args.category, "name", "Categoria"),
      name,
      description: text(args.description, "description", "Descrição"),
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
      summary: `Serviço "${name}" cadastrado`,
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
    if (args.name !== undefined) patch.name = requiredText(args.name, "name", "Nome do serviço");
    if (args.category !== undefined)
      patch.category = requiredText(args.category, "name", "Categoria");
    if (args.description !== undefined)
      patch.description = text(args.description, "description", "Descrição");
    if (args.active !== undefined) patch.active = args.active;
    if (args.durationMin !== undefined) {
      if (args.durationMin < 5 || args.durationMin > 480)
        bad("Duração deve estar entre 5 e 480 minutos.");
      patch.durationMin = args.durationMin;
    }
    if (args.priceCents !== undefined) {
      if (args.priceCents < 0) bad("Preço inválido.");
      patch.priceCents = args.priceCents;
    }
    if (args.commissionModel !== undefined || args.commissionValue !== undefined) {
      const model = args.commissionModel ?? service.commissionModel;
      const value = args.commissionValue ?? service.commissionValue;
      assertCommission(model, value);
      patch.commissionModel = model;
      patch.commissionValue = model === "herdar" ? undefined : value;
    }
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