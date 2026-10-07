import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { audit, bad, notify, requireManage, requireSameOrg, requireView } from "./lib";
import { dateISO, requiredText, text, textList } from "./validation";
import { addDaysISO, todayISO } from "../lib/dates";
import { recordSale } from "./sales";

/**
 * Valida a lista de serviços de um pacote/plano: cada serviço precisa ser da
 * própria organização (senão a listagem mostrava serviços de outra barbearia)
 * e não pode haver repetição.
 */
async function assertServiceItems(
  ctx: Parameters<typeof requireManage>[0],
  organizationId: Id<"organizations">,
  items: Array<{ serviceId: Id<"services"> }>,
  label: string,
): Promise<void> {
  if (items.length === 0) bad(`Adicione ao menos um serviço ao ${label}.`);
  if (items.length > 50) bad(`${label}: no máximo 50 serviços.`);
  for (const item of items) {
    await requireSameOrg(await ctx.db.get(item.serviceId), organizationId, "Serviço");
  }
  if (new Set(items.map((i) => i.serviceId as string)).size !== items.length)
    bad(`Há serviços repetidos no ${label}.`);
}

/* ------------------------------ pacotes ------------------------------ */

export const listPackages = query({
  args: {
    organizationId: v.id("organizations"),
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireView(ctx, args.organizationId, "packages");
    const rows = await ctx.db
      .query("packages")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const result = [];
    for (const row of rows) {
      if (!args.includeInactive && !row.active) continue;
      const items = [];
      let credits = 0;
      for (const it of row.items) {
        const service = await ctx.db.get(it.serviceId);
        items.push({ serviceId: it.serviceId, sessions: it.sessions, serviceName: service?.name ?? "—", durationMin: service?.durationMin ?? 0, priceCents: service?.priceCents ?? 0 });
        credits += it.sessions;
      }
      const sold = await ctx.db
        .query("clientPackages")
        .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
        .filter((q) => q.eq(q.field("packageId"), row._id))
        .collect();
      result.push({
        ...row,
        items,
        credits,
        soldCount: sold.length,
        activeCount: sold.filter((s) => s.status === "ativo").length,
      });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const listClientPackages = query({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.optional(v.id("clients")),
    status: v.optional(v.union(v.literal("ativo"), v.literal("esgotado"), v.literal("expirado"))),
  },
  handler: async (ctx, args) => {
    await requireView(ctx, args.organizationId, "packages");
    const rows = await ctx.db
      .query("clientPackages")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const out = [];
    for (const row of rows) {
      if (args.clientId && row.clientId !== args.clientId) continue;
      if (args.status && row.status !== args.status) continue;
      const [client, pkg] = await Promise.all([ctx.db.get(row.clientId), ctx.db.get(row.packageId)]);
      out.push({
        ...row,
        clientName: client?.name ?? "—",
        clientPhone: client?.phone ?? "",
        packageName: pkg?.name ?? "—",
        remaining: Math.max(0, row.creditsTotal - row.creditsUsed),
        expired: row.expiryDate < todayISO(),
      });
    }
    return out.sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
  },
});

export const createPackage = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    priceCents: v.number(),
    validityDays: v.number(),
    items: v.array(v.object({ serviceId: v.id("services"), sessions: v.number() })),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "packages");
    const name = requiredText(args.name, "name", "Nome do pacote");
    await assertServiceItems(ctx, org._id, args.items, "pacote");
    if (args.items.some((i) => i.sessions <= 0 || !Number.isInteger(i.sessions)))
      bad("Sessões devem ser números inteiros maiores que zero.");
    if (!Number.isInteger(args.validityDays) || args.validityDays <= 0)
      bad("Informe a validade do pacote em dias.");
    if (args.priceCents < 0) bad("O preço do pacote não pode ser negativo.");
    const id = await ctx.db.insert("packages", {
      organizationId: org._id,
      name,
      description: text(args.description, "description", "Descrição"),
      priceCents: args.priceCents,
      validityDays: args.validityDays,
      items: args.items,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await audit(ctx, org._id, userId, {
      action: "criou",
      module: "Pacotes",
      recordType: "packages",
      recordId: id,
      summary: `Pacote "${name}" criado`,
    });
    return id;
  },
});

export const updatePackage = mutation({
  args: {
    organizationId: v.id("organizations"),
    packageId: v.id("packages"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    priceCents: v.optional(v.number()),
    validityDays: v.optional(v.number()),
    items: v.optional(v.array(v.object({ serviceId: v.id("services"), sessions: v.number() }))),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "packages");
    const pkg = await requireSameOrg(await ctx.db.get(args.packageId), org._id, "Pacote");
    if (args.items) {
      await assertServiceItems(ctx, org._id, args.items, "pacote");
      if (args.items.some((i) => i.sessions <= 0 || !Number.isInteger(i.sessions)))
        bad("Sessões devem ser números inteiros maiores que zero.");
    }
    if (args.validityDays !== undefined && (!Number.isInteger(args.validityDays) || args.validityDays <= 0))
      bad("Informe a validade do pacote em dias.");
    await ctx.db.patch(pkg._id, {
      name: args.name === undefined ? pkg.name : requiredText(args.name, "name", "Nome do pacote"),
      description:
        args.description === undefined
          ? pkg.description
          : text(args.description, "description", "Descrição"),
      priceCents: args.priceCents ?? pkg.priceCents,
      validityDays: args.validityDays ?? pkg.validityDays,
      items: args.items ?? pkg.items,
      active: args.active ?? pkg.active,
      updatedAt: Date.now(),
    });
    await audit(ctx, org._id, userId, {
      action: "atualizou",
      module: "Pacotes",
      recordType: "packages",
      recordId: pkg._id,
      summary: `Pacote "${pkg.name}" atualizado`,
    });
  },
});

/** Vende um pacote ao cliente: gera venda real + créditos. */
export const buyPackage = mutation({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.id("clients"),
    packageId: v.id("packages"),
    payments: v.array(
      v.object({
        method: v.union(v.literal("dinheiro"), v.literal("debito"), v.literal("credito"), v.literal("pix")),
        amountCents: v.number(),
      }),
    ),
    date: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "packages");
    const pkg = await requireSameOrg(await ctx.db.get(args.packageId), org._id, "Pacote");
    if (!pkg.active) bad("Este pacote está inativo.");
    const client = await requireSameOrg(await ctx.db.get(args.clientId), org._id, "Cliente");
    const date = args.date ? dateISO(args.date, "Data da compra") : todayISO();

    const sale = await recordSale(ctx, org, userId as Id<"users">, {
      date,
      clientId: args.clientId,
      items: [{ kind: "pacote", refId: args.packageId, qty: 1, unitPriceCents: pkg.priceCents }],
      payments: args.payments,
      notes: text(args.notes, "note", "Observações"),
    });

    const creditsTotal = pkg.items.reduce((s, i) => s + i.sessions, 0);
    const id = await ctx.db.insert("clientPackages", {
      organizationId: org._id,
      clientId: args.clientId,
      packageId: args.packageId,
      purchaseDate: date,
      expiryDate: addDaysISO(date, pkg.validityDays),
      creditsTotal,
      creditsUsed: 0,
      pricePaidCents: pkg.priceCents,
      status: "ativo",
      saleId: sale.saleId,
      createdAt: Date.now(),
    });
    await audit(ctx, org._id, userId, {
      action: "vendeu",
      module: "Pacotes",
      recordType: "clientPackages",
      recordId: id,
      summary: `Pacote "${pkg.name}" vendido para ${client.name}`,
    });
    return id;
  },
});

/* ------------------------------ planos de assinatura ------------------------------ */

export const listPlans = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireView(ctx, args.organizationId, "memberships");
    const rows = await ctx.db
      .query("membershipPlans")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const result = [];
    for (const row of rows) {
      const items = [];
      for (const it of row.items) {
        const service = await ctx.db.get(it.serviceId);
        items.push({ serviceId: it.serviceId, credits: it.credits, serviceName: service?.name ?? "—" });
      }
      result.push({
        ...row,
        items,
        subscribers: memberships.filter((m) => m.planId === row._id && m.status === "ativa").length,
      });
    }
    return result;
  },
});

export const createPlan = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    priceCents: v.number(),
    items: v.array(v.object({ serviceId: v.id("services"), credits: v.number() })),
    benefits: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "memberships");
    const name = requiredText(args.name, "name", "Nome do plano");
    await assertServiceItems(ctx, org._id, args.items, "plano");
    if (args.items.some((i) => i.credits <= 0 || !Number.isInteger(i.credits)))
      bad("Créditos devem ser números inteiros maiores que zero.");
    if (args.priceCents < 0) bad("O preço do plano não pode ser negativo.");
    const id = await ctx.db.insert("membershipPlans", {
      organizationId: org._id,
      name,
      description: text(args.description, "description", "Descrição"),
      priceCents: args.priceCents,
      items: args.items,
      benefits: textList(args.benefits, "reference", 12, "Benefícios") ?? [],
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await audit(ctx, org._id, userId, {
      action: "criou",
      module: "Assinaturas",
      recordType: "membershipPlans",
      recordId: id,
      summary: `Plano "${name}" criado`,
    });
    return id;
  },
});

export const updatePlan = mutation({
  args: {
    organizationId: v.id("organizations"),
    planId: v.id("membershipPlans"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    priceCents: v.optional(v.number()),
    items: v.optional(v.array(v.object({ serviceId: v.id("services"), credits: v.number() }))),
    benefits: v.optional(v.array(v.string())),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "memberships");
    const plan = await requireSameOrg(await ctx.db.get(args.planId), org._id, "Plano");
    if (args.items) {
      await assertServiceItems(ctx, org._id, args.items, "plano");
      if (args.items.some((i) => i.credits <= 0 || !Number.isInteger(i.credits)))
        bad("Créditos devem ser números inteiros maiores que zero.");
    }
    await ctx.db.patch(plan._id, {
      name: args.name === undefined ? plan.name : requiredText(args.name, "name", "Nome do plano"),
      description:
        args.description === undefined
          ? plan.description
          : text(args.description, "description", "Descrição"),
      priceCents: args.priceCents ?? plan.priceCents,
      items: args.items ?? plan.items,
      benefits:
        args.benefits === undefined
          ? plan.benefits
          : textList(args.benefits, "reference", 12, "Benefícios"),
      active: args.active ?? plan.active,
      updatedAt: Date.now(),
    });
    await audit(ctx, org._id, userId, {
      action: "atualizou",
      module: "Assinaturas",
      recordType: "membershipPlans",
      recordId: plan._id,
      summary: `Plano "${plan.name}" atualizado`,
    });
  },
});

/* ------------------------------ assinaturas ------------------------------ */

export const listMemberships = query({
  args: {
    organizationId: v.id("organizations"),
    status: v.optional(v.union(v.literal("ativa"), v.literal("pausada"), v.literal("cancelada"))),
    clientId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args) => {
    await requireView(ctx, args.organizationId, "memberships");
    const rows = await ctx.db
      .query("memberships")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const out = [];
    for (const m of rows) {
      if (args.status && m.status !== args.status) continue;
      if (args.clientId && m.clientId !== args.clientId) continue;
      const [client, plan] = await Promise.all([ctx.db.get(m.clientId), ctx.db.get(m.planId)]);
      out.push({
        ...m,
        clientName: client?.name ?? "—",
        clientPhone: client?.phone ?? "",
        planName: plan?.name ?? "—",
        creditsRemaining: Math.max(0, m.creditsTotal - m.creditsUsed),
        daysToRenewal: Math.round(
          (Date.parse(`${m.renewalDate}T00:00:00Z`) - Date.parse(`${todayISO()}T00:00:00Z`)) /
            86_400_000,
        ),
      });
    }
    return out.sort((a, b) => a.renewalDate.localeCompare(b.renewalDate));
  },
});

export const subscribe = mutation({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.id("clients"),
    planId: v.id("membershipPlans"),
    startDate: v.optional(v.string()),
    payments: v.array(
      v.object({
        method: v.union(v.literal("dinheiro"), v.literal("debito"), v.literal("credito"), v.literal("pix")),
        amountCents: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "memberships");
    const plan = await requireSameOrg(await ctx.db.get(args.planId), org._id, "Plano");
    if (!plan.active) bad("Este plano está inativo.");
    const client = await requireSameOrg(await ctx.db.get(args.clientId), org._id, "Cliente");
    const startDate = args.startDate ? dateISO(args.startDate, "Início da assinatura") : todayISO();

    const creditsTotal = plan.items.reduce((s, i) => s + i.credits, 0);
    const sale = await recordSale(ctx, org, userId as Id<"users">, {
      date: startDate,
      clientId: args.clientId,
      items: [{ kind: "plano", refId: args.planId, qty: 1, unitPriceCents: plan.priceCents }],
      payments: args.payments,
    });

    const id = await ctx.db.insert("memberships", {
      organizationId: org._id,
      clientId: args.clientId,
      planId: args.planId,
      startDate,
      renewalDate: addDaysISO(startDate, 30),
      status: "ativa",
      creditsTotal,
      creditsUsed: 0,
      priceCents: plan.priceCents,
      billingStatus: "em_dia",
      createdAt: Date.now(),
    });
    await audit(ctx, org._id, userId, {
      action: "assinou",
      module: "Assinaturas",
      recordType: "memberships",
      recordId: id,
      summary: `${client.name} assinou o plano "${plan.name}"`,
    });
    void sale;
    return id;
  },
});

export const setMembershipStatus = mutation({
  args: {
    organizationId: v.id("organizations"),
    membershipId: v.id("memberships"),
    status: v.union(v.literal("ativa"), v.literal("pausada"), v.literal("cancelada")),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "memberships");
    const m = await ctx.db.get(args.membershipId);
    if (!m || m.organizationId !== org._id) bad("Assinatura não encontrada.");
    const client = await ctx.db.get(m.clientId);
    await ctx.db.patch(m._id, {
      status: args.status,
      cancelledAt: args.status === "cancelada" ? Date.now() : undefined,
    });
    await audit(ctx, org._id, userId, {
      action: "atualizou",
      module: "Assinaturas",
      recordType: "memberships",
      recordId: m._id,
      summary: `Assinatura de ${client?.name ?? "cliente"} marcada como ${args.status}`,
    });
  },
});

/** Registra a cobrança do próximo ciclo: gera venda, estende renovação e reseta créditos. */
export const renew = mutation({
  args: {
    organizationId: v.id("organizations"),
    membershipId: v.id("memberships"),
    payments: v.array(
      v.object({
        method: v.union(v.literal("dinheiro"), v.literal("debito"), v.literal("credito"), v.literal("pix")),
        amountCents: v.number(),
      }),
    ),
    date: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "memberships");
    const m = await ctx.db.get(args.membershipId);
    if (!m || m.organizationId !== org._id) bad("Assinatura não encontrada.");
    if (m.status === "cancelada") bad("Assinatura cancelada não pode ser renovada.");
    const plan = await requireSameOrg(await ctx.db.get(m.planId), org._id, "Plano");
    const client = await requireSameOrg(await ctx.db.get(m.clientId), org._id, "Cliente");
    const date = args.date ? dateISO(args.date, "Data da renovação") : todayISO();
    const base = m.renewalDate > date ? m.renewalDate : date;
    const renewalDate = addDaysISO(base, 30);
    const creditsTotal = plan.items.reduce((s, i) => s + i.credits, 0);

    await recordSale(ctx, org, userId as Id<"users">, {
      date,
      clientId: m.clientId,
      items: [{ kind: "plano", refId: plan._id, qty: 1, unitPriceCents: m.priceCents }],
      payments: args.payments,
      notes: "Renovação de assinatura",
    });
    await ctx.db.patch(m._id, {
      renewalDate,
      creditsTotal,
      creditsUsed: 0,
      status: "ativa",
      billingStatus: "em_dia",
    });
    await audit(ctx, org._id, userId, {
      action: "renovou",
      module: "Assinaturas",
      recordType: "memberships",
      recordId: m._id,
      summary: `Assinatura de ${client.name} renovada até ${renewalDate}`,
    });
    await notify(ctx, org._id, {
      type: "renovacao_ok",
      title: "Assinatura renovada",
      message: `${client.name} — próxima renovação em ${renewalDate}.`,
      severity: "info",
      dedupKey: `renovacao_ok:${m._id}:${renewalDate}`,
      link: "/app/assinaturas",
    });
    return renewalDate;
  },
});