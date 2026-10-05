import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { audit, bad, notify, requireManage, requireView } from "./lib";
import { todayISO } from "../lib/dates";

/* ------------------------------ consultas ------------------------------ */

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    includeInactive: v.optional(v.boolean()),
    onlyLowStock: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireView(ctx, args.organizationId, "products");
    const rows = await ctx.db
      .query("products")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return rows
      .filter((p) => (args.includeInactive ? true : p.active))
      .filter((p) => (args.onlyLowStock ? p.stock <= p.minStock : true))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({
        ...p,
        marginCents: p.priceCents - p.costCents,
        marginPercent: p.priceCents > 0 ? ((p.priceCents - p.costCents) / p.priceCents) * 100 : 0,
        stockValueCents: p.costCents * p.stock,
        retailValueCents: p.priceCents * p.stock,
        lowStock: p.stock <= p.minStock,
      }));
  },
});

export const detail = query({
  args: { organizationId: v.id("organizations"), productId: v.id("products") },
  handler: async (ctx, args) => {
    await requireView(ctx, args.organizationId, "inventory");
    const product = await ctx.db.get(args.productId);
    if (!product || product.organizationId !== args.organizationId) bad("Produto não encontrado.");
    const movements = await ctx.db
      .query("inventoryMovements")
      .withIndex("by_org_product", (q) =>
        q.eq("organizationId", args.organizationId).eq("productId", args.productId),
      )
      .collect();
    const supplier = product.supplierId ? await ctx.db.get(product.supplierId) : null;
    return { product, movements: movements.sort((a, b) => b.createdAt - a.createdAt), supplier };
  },
});

export const movements = query({
  args: {
    organizationId: v.id("organizations"),
    productId: v.optional(v.id("products")),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireView(ctx, args.organizationId, "inventory");
    let rows = await ctx.db
      .query("inventoryMovements")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    rows = rows
      .filter((m) => (args.productId ? m.productId === args.productId : true))
      .filter((m) => (args.from ? m.date >= args.from : true))
      .filter((m) => (args.to ? m.date <= args.to : true))
      .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))
      .slice(0, 200);
    const out = [];
    for (const m of rows) {
      const product = await ctx.db.get(m.productId);
      out.push({ ...m, productName: product?.name ?? "—", productUnit: product?.unit ?? "un" });
    }
    return out;
  },
});

export const summary = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireView(ctx, args.organizationId, "inventory");
    const rows = await ctx.db
      .query("products")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const active = rows.filter((p) => p.active);
    return {
      totalProducts: active.length,
      lowStock: rows.filter((p) => p.active && p.stock <= p.minStock).length,
      outOfStock: rows.filter((p) => p.active && p.stock <= 0).length,
      costValueCents: rows.reduce((s, p) => s + p.costCents * p.stock, 0),
      retailValueCents: rows.reduce((s, p) => s + p.priceCents * p.stock, 0),
    };
  },
});

export const listSuppliers = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireView(ctx, args.organizationId, "products");
    return await ctx.db
      .query("suppliers")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

/* ------------------------------ mutações ------------------------------ */

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    sku: v.string(),
    name: v.string(),
    category: v.string(),
    supplierId: v.optional(v.id("suppliers")),
    costCents: v.number(),
    priceCents: v.number(),
    stock: v.number(),
    minStock: v.number(),
    unit: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "products");
    if (!args.name.trim()) bad("Informe o nome do produto.");
    if (!args.sku.trim()) bad("Informe o SKU do produto.");
    if (args.priceCents < args.costCents)
      bad("O preço de venda não pode ser menor que o custo.");
    const id = await ctx.db.insert("products", {
      organizationId: org._id,
      sku: args.sku.trim().toUpperCase(),
      name: args.name.trim(),
      category: args.category,
      supplierId: args.supplierId,
      costCents: args.costCents,
      priceCents: args.priceCents,
      stock: 0,
      minStock: args.minStock,
      unit: args.unit ?? "un",
      active: true,
      notes: args.notes,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    if (args.stock > 0) {
      await ctx.db.insert("inventoryMovements", {
        organizationId: org._id,
        productId: id,
        date: todayISO(),
        quantity: args.stock,
        type: "ajuste",
        unitCostCents: args.costCents,
        reference: "Estoque inicial",
        userId: userId as Id<"users">,
        notes: "Cadastro inicial do produto",
        createdAt: Date.now(),
      });
      await ctx.db.patch(id, { stock: args.stock });
    }
    await audit(ctx, org._id, userId, {
      action: "criou",
      module: "Produtos",
      recordType: "products",
      recordId: id,
      summary: `Produto "${args.name}" cadastrado`,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    productId: v.id("products"),
    sku: v.optional(v.string()),
    name: v.optional(v.string()),
    category: v.optional(v.string()),
    supplierId: v.optional(v.id("suppliers")),
    costCents: v.optional(v.number()),
    priceCents: v.optional(v.number()),
    minStock: v.optional(v.number()),
    unit: v.optional(v.string()),
    notes: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "products");
    const product = await ctx.db.get(args.productId);
    if (!product || product.organizationId !== org._id) bad("Produto não encontrado.");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const key of [
      "sku", "name", "category", "supplierId", "costCents", "priceCents",
      "minStock", "unit", "notes", "active",
    ] as const) {
      if (args[key] !== undefined) patch[key] = args[key];
    }
    const cost = args.costCents ?? product.costCents;
    const price = args.priceCents ?? product.priceCents;
    if (price < cost) bad("O preço de venda não pode ser menor que o custo.");
    await ctx.db.patch(product._id, patch);
    await audit(ctx, org._id, userId, {
      action: "atualizou",
      module: "Produtos",
      recordType: "products",
      recordId: product._id,
      summary: `Produto "${product.name}" atualizado`,
    });
  },
});

/** Lança um movimento de estoque e recalcula o saldo automaticamente. */
export const addMovement = mutation({
  args: {
    organizationId: v.id("organizations"),
    productId: v.id("products"),
    quantity: v.number(),
    type: v.union(
      v.literal("compra"),
      v.literal("ajuste"),
      v.literal("devolucao"),
      v.literal("correcao"),
      v.literal("outro"),
    ),
    unitCostCents: v.optional(v.number()),
    reference: v.optional(v.string()),
    notes: v.optional(v.string()),
    date: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "inventory");
    const product = await ctx.db.get(args.productId);
    if (!product || product.organizationId !== org._id) bad("Produto não encontrado.");
    if (!Number.isFinite(args.quantity) || args.quantity === 0)
      bad("Informe a quantidade do movimento.");

    const isOut = args.quantity < 0;
    const abs = Math.abs(args.quantity);
    const type = isOut ? (args.type === "compra" ? "ajuste" : args.type) : args.type;

    const newStock = isOut ? product.stock - abs : product.stock + abs;
    if (newStock < 0 && !org.settings.allowNegativeStock)
      bad(`Estoque insuficiente: disponível ${product.stock} ${product.unit}.`);

    await ctx.db.patch(product._id, { stock: newStock, updatedAt: Date.now() });
    await ctx.db.insert("inventoryMovements", {
      organizationId: org._id,
      productId: product._id,
      date: args.date ?? todayISO(),
      quantity: abs,
      type,
      unitCostCents: args.unitCostCents,
      reference: args.reference,
      userId: userId as Id<"users">,
      notes: args.notes,
      createdAt: Date.now(),
    });
    await audit(ctx, org._id, userId, {
      action: isOut ? "retirou" : "adicionou",
      module: "Estoque",
      recordType: "products",
      recordId: product._id,
      summary: `${isOut ? "Saída" : "Entrada"} de ${abs} ${product.unit} — ${product.name} (saldo ${newStock})`,
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
    return newStock;
  },
});

export const createSupplier = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { org } = await requireManage(ctx, args.organizationId, "products");
    if (!args.name.trim()) bad("Informe o nome do fornecedor.");
    return await ctx.db.insert("suppliers", {
      organizationId: org._id,
      name: args.name.trim(),
      phone: args.phone,
      email: args.email,
      notes: args.notes,
      createdAt: Date.now(),
    });
  },
});