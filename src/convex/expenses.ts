import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { audit, bad, requireManage, requireView } from "./lib";
import { assertUploadedFile } from "./fileSecurity";
import { requiredText, text } from "./validation";
import { todayISO } from "../lib/dates";

const methodValidator = v.union(
  v.literal("dinheiro"),
  v.literal("debito"),
  v.literal("credito"),
  v.literal("pix"),
);

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { org } = await requireView(ctx, args.organizationId, "expenses");
    const rows = await ctx.db
      .query("expenses")
      .withIndex("by_org_date", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const filtered = rows
      .filter((e) => (args.from ? e.date >= args.from : true))
      .filter((e) => (args.to ? e.date <= args.to : true))
      .filter((e) => (args.category ? e.category === args.category : true))
      .sort((a, b) => b.date.localeCompare(a.date));

    const byCategory = new Map<string, number>();
    for (const e of filtered) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amountCents);

    return {
      expenses: filtered.slice(0, 200).map((e) => ({
        ...e,
        hasFile: Boolean(e.fileStorageId),
      })),
      total: filtered.reduce((s, e) => s + e.amountCents, 0),
      byCategory: [...byCategory.entries()]
        .map(([category, cents]) => ({ category, cents }))
        .sort((a, b) => b.cents - a.cents),
      categories: org.settings.expenseCategories,
    };
  },
});

export const summary = query({
  args: {
    organizationId: v.id("organizations"),
    from: v.string(),
    to: v.string(),
  },
  handler: async (ctx, args) => {
    await requireView(ctx, args.organizationId, "expenses");
    const rows = await ctx.db
      .query("expenses")
      .withIndex("by_org_date", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const inRange = rows.filter((e) => e.date >= args.from && e.date <= args.to);
    return {
      totalCents: inRange.reduce((s, e) => s + e.amountCents, 0),
      count: inRange.length,
      recurringCents: inRange.filter((e) => e.recurring).reduce((s, e) => s + e.amountCents, 0),
    };
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    date: v.optional(v.string()),
    category: v.string(),
    supplier: v.optional(v.string()),
    description: v.string(),
    amountCents: v.number(),
    method: methodValidator,
    recurring: v.optional(v.boolean()),
    notes: v.optional(v.string()),
    fileStorageId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    fileMimeType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "expenses");
    if (args.amountCents <= 0) bad("Informe um valor maior que zero.");
    const description = requiredText(args.description, "description", "Descrição");
    const category = requiredText(args.category, "name", "Categoria");
    const supplier = text(args.supplier, "name", "Fornecedor");
    const notes = text(args.notes, "note", "Observações");
    const fileName = text(args.fileName, "name", "Nome do comprovante");
    const date = args.date ?? todayISO();
    const checkedFile = args.fileStorageId
      ? await assertUploadedFile(ctx, {
          organizationId: org._id,
          storageId: args.fileStorageId,
          mimeType: args.fileMimeType ?? "application/pdf",
          size: args.fileSize ?? 0,
        })
      : null;
    const id = await ctx.db.insert("expenses", {
      organizationId: org._id,
      date,
      category,
      supplier,
      description,
      amountCents: args.amountCents,
      method: args.method,
      recurring: args.recurring ?? false,
      notes,
      fileStorageId: args.fileStorageId,
      fileName,
      userId: userId as Id<"users">,
      createdAt: Date.now(),
    });
    if (args.method === "dinheiro") {
      const session = await ctx.db
        .query("cashSessions")
        .withIndex("by_org_status", (q) =>
          q.eq("organizationId", args.organizationId).eq("status", "aberto"),
        )
        .first();
      if (session) {
        await ctx.db.insert("cashMovements", {
          organizationId: org._id,
          sessionId: session._id,
          type: "despesa",
          amountCents: args.amountCents,
          description: args.description,
          date,
          userId: userId as Id<"users">,
          expenseId: id,
          createdAt: Date.now(),
        });
      }
    }
    if (args.fileStorageId) {
      await ctx.db.insert("files", {
        organizationId: org._id,
        storageId: args.fileStorageId,
        recordType: "expenses",
        recordId: id as string,
        name: fileName ?? "comprovante",
        mimeType: checkedFile!.mimeType,
        size: checkedFile!.size,
        uploadedBy: userId as Id<"users">,
        createdAt: Date.now(),
      });
    }
    await audit(ctx, org._id, userId, {
      action: "criou",
      module: "Despesas",
      recordType: "expenses",
      recordId: id,
      summary: `Despesa "${description}" — R$ ${(args.amountCents / 100).toFixed(2)}`,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    expenseId: v.id("expenses"),
    date: v.optional(v.string()),
    category: v.optional(v.string()),
    supplier: v.optional(v.string()),
    description: v.optional(v.string()),
    amountCents: v.optional(v.number()),
    method: v.optional(methodValidator),
    recurring: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "expenses");
    const expense = await ctx.db.get(args.expenseId);
    if (!expense || expense.organizationId !== org._id) bad("Despesa não encontrada.");
    const patch: Record<string, unknown> = {};
    if (args.description !== undefined)
      patch.description = requiredText(args.description, "description", "Descrição");
    if (args.category !== undefined)
      patch.category = requiredText(args.category, "name", "Categoria");
    if (args.supplier !== undefined) patch.supplier = text(args.supplier, "name", "Fornecedor");
    if (args.notes !== undefined) patch.notes = text(args.notes, "note", "Observações");
    if (args.date !== undefined) patch.date = args.date;
    if (args.amountCents !== undefined) {
      if (args.amountCents <= 0) bad("Informe um valor maior que zero.");
      patch.amountCents = args.amountCents;
    }
    if (args.method !== undefined) patch.method = args.method;
    if (args.recurring !== undefined) patch.recurring = args.recurring;
    await ctx.db.patch(expense._id, patch);
    await audit(ctx, org._id, userId, {
      action: "atualizou",
      module: "Despesas",
      recordType: "expenses",
      recordId: expense._id,
      summary: `Despesa "${expense.description}" atualizada`,
    });
  },
});

export const remove = mutation({
  args: { organizationId: v.id("organizations"), expenseId: v.id("expenses") },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "expenses");
    const expense = await ctx.db.get(args.expenseId);
    if (!expense || expense.organizationId !== org._id) bad("Despesa não encontrada.");
    if (expense.date < todayISO().slice(0, 8) + "01")
      bad("Despesas de meses anteriores não podem ser excluídas. Registre uma correção.");
    await ctx.db.delete(expense._id);
    await audit(ctx, org._id, userId, {
      action: "excluiu",
      module: "Despesas",
      recordType: "expenses",
      recordId: expense._id,
      summary: `Despesa "${expense.description}" excluída`,
    });
  },
});