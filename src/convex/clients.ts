import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { audit, bad, requireManage, requireView } from "./lib";
import { todayISO } from "../lib/dates";

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    search: v.optional(v.string()),
    tag: v.optional(v.string()),
    status: v.optional(v.union(v.literal("ativo"), v.literal("inativo"))),
    filter: v.optional(v.union(v.literal("todos"), v.literal("inativos"), v.literal("novos"), v.literal("vip"))),
    sort: v.optional(
      v.union(v.literal("nome"), v.literal("recorrencia"), v.literal("gasto"), v.literal("ultima")),
    ),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { org } = await requireView(ctx, args.organizationId, "clients");
    const limit = args.limit ?? 25;
    const offset = args.offset ?? 0;
    let rows = await ctx.db
      .query("clients")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const term = (args.search ?? "").trim().toLowerCase();
    if (term) {
      rows = rows.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          c.phone.replace(/\D/g, "").includes(term.replace(/\D/g, "")) ||
          (c.email ?? "").toLowerCase().includes(term),
      );
    }
    if (args.tag) rows = rows.filter((c) => c.tags.includes(args.tag!));
    if (args.status) rows = rows.filter((c) => c.status === args.status);
    if (args.filter === "inativos") {
      rows = rows.filter(
        (c) =>
          !c.lastVisitDate ||
          daysBetween(c.lastVisitDate, todayISO()) > org.settings.inactivityDays,
      );
    }
    if (args.filter === "novos") {
      const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
      rows = rows.filter((c) => c.createdAt >= Date.parse(`${cutoff}T00:00:00Z`));
    }
    if (args.filter === "vip") rows = rows.filter((c) => c.tags.includes("VIP"));

    const sort = args.sort ?? "nome";
    rows.sort((a, b) => {
      if (sort === "nome") return a.name.localeCompare(b.name);
      if (sort === "gasto") return b.totalSpentCents - a.totalSpentCents;
      if (sort === "ultima") return (b.lastVisitDate ?? "").localeCompare(a.lastVisitDate ?? "");
      return b.totalVisits - a.totalVisits;
    });

    const total = rows.length;
    const page = rows.slice(offset, offset + limit).map((c) => ({
      ...c,
      inactiveDays: c.lastVisitDate ? daysBetween(c.lastVisitDate, todayISO()) : null,
    }));
    return { total, clients: page };
  },
});

function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  );
}

export const tags = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireView(ctx, organizationId, "clients");
    const rows = await ctx.db
      .query("clients")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .collect();
    const set = new Set<string>();
    for (const c of rows) for (const t of c.tags) set.add(t);
    return [...set].sort();
  },
});

export const profile = query({
  args: { organizationId: v.id("organizations"), clientId: v.id("clients") },
  handler: async (ctx, { organizationId, clientId }) => {
    await requireView(ctx, organizationId, "clients");
    const client = await ctx.db.get(clientId);
    if (!client || client.organizationId !== organizationId) bad("Cliente não encontrado.");

    const [appointments, sales, memberships, clientPackages, followups, feedback] =
      await Promise.all([
        ctx.db
          .query("appointments")
          .withIndex("by_org_client", (q) =>
            q.eq("organizationId", organizationId).eq("clientId", clientId),
          )
          .collect(),
        ctx.db
          .query("sales")
          .withIndex("by_org_client", (q) =>
            q.eq("organizationId", organizationId).eq("clientId", clientId),
          )
          .collect(),
        ctx.db
          .query("memberships")
          .withIndex("by_org_client", (q) =>
            q.eq("organizationId", organizationId).eq("clientId", clientId),
          )
          .collect(),
        ctx.db
          .query("clientPackages")
          .withIndex("by_org_client", (q) =>
            q.eq("organizationId", organizationId).eq("clientId", clientId),
          )
          .collect(),
        ctx.db
          .query("followups")
          .withIndex("by_org_client", (q) =>
            q.eq("organizationId", organizationId).eq("clientId", clientId),
          )
          .collect(),
        ctx.db
          .query("feedback")
          .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
          .collect(),
      ]);

    const loyaltyAccount = await ctx.db
      .query("loyaltyAccounts")
      .withIndex("by_org_client", (q) =>
        q.eq("organizationId", organizationId).eq("clientId", clientId),
      )
      .first();
    const loyaltyTransactions = await ctx.db
      .query("loyaltyTransactions")
      .withIndex("by_org_client", (q) =>
        q.eq("organizationId", organizationId).eq("clientId", clientId),
      )
      .collect();
    const clientFeedback = feedback.filter((f) => f.clientId === clientId);
    const notes = await ctx.db
      .query("clientNotes")
      .withIndex("by_client", (q) => q.eq("clientId", clientId))
      .collect();

    const nextAppointment = appointments
      .filter((a) => a.date >= todayISO() && (a.status === "agendado" || a.status === "confirmado"))
      .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))[0];

    const saleDetails = [];
    for (const sale of sales.sort((a, b) => b.createdAt - a.createdAt).slice(0, 30)) {
      const items = await ctx.db
        .query("saleItems")
        .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
        .collect();
      const payments = await ctx.db
        .query("payments")
        .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
        .collect();
      saleDetails.push({ sale, items, payments });
    }

    const appointmentDetails = [];
    for (const a of appointments.sort((a, b) =>
      (b.date + b.startTime).localeCompare(a.date + a.startTime),
    ).slice(0, 40)) {
      const [barber, service] = await Promise.all([
        ctx.db.get(a.barberId),
        ctx.db.get(a.serviceId),
      ]);
      appointmentDetails.push({
        ...a,
        barberName: barber?.name ?? "—",
        serviceName: service?.name ?? "—",
      });
    }

    const favoriteServices = new Map<string, number>();
    for (const sale of sales) {
      const items = await ctx.db
        .query("saleItems")
        .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
        .collect();
      for (const it of items) {
        if (it.kind === "servico") favoriteServices.set(it.name, (favoriteServices.get(it.name) ?? 0) + 1);
      }
    }

    const membershipDetails = [];
    for (const m of memberships) {
      const plan = await ctx.db.get(m.planId);
      membershipDetails.push({ membership: m, plan });
    }
    const packageDetails = [];
    for (const cp of clientPackages) {
      const pkg = await ctx.db.get(cp.packageId);
      packageDetails.push({ clientPackage: cp, package: pkg });
    }

    return {
      client: {
        ...client,
        inactiveDays: client.lastVisitDate ? daysBetween(client.lastVisitDate, todayISO()) : null,
      },
      appointments: appointmentDetails,
      sales: saleDetails,
      memberships: membershipDetails,
      packages: packageDetails,
      followups: followups.sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
      feedback: clientFeedback.sort((a, b) => b.createdAt - a.createdAt),
      notes: notes.sort((a, b) => b.createdAt - a.createdAt),
      loyaltyAccount,
      loyaltyTransactions: loyaltyTransactions.sort((a, b) => b.createdAt - a.createdAt).slice(0, 50),
      nextAppointment,
      favoriteServices: [...favoriteServices.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count })),
      avgRating:
        clientFeedback.length > 0
          ? clientFeedback.reduce((s, f) => s + f.rating, 0) / clientFeedback.length
          : null,
    };
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    phone: v.string(),
    email: v.optional(v.string()),
    birthDate: v.optional(v.string()),
    gender: v.optional(v.string()),
    preferredBarberId: v.optional(v.id("barbers")),
    tags: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    consentMarketing: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "clients");
    if (!args.name.trim()) bad("Informe o nome do cliente.");
    const digits = args.phone.replace(/\D/g, "");
    if (digits.length < 10) bad("Informe um telefone válido com DDD.");
    const duplicate = await ctx.db
      .query("clients")
      .withIndex("by_org_phone", (q) =>
        q.eq("organizationId", org._id).eq("phone", args.phone),
      )
      .first();
    if (duplicate) bad("Já existe um cliente com este telefone.");
    const id = await ctx.db.insert("clients", {
      organizationId: org._id,
      name: args.name.trim(),
      phone: args.phone,
      email: args.email,
      birthDate: args.birthDate,
      gender: args.gender,
      preferredBarberId: args.preferredBarberId,
      tags: args.tags ?? [],
      notes: args.notes,
      consentMarketing: args.consentMarketing ?? false,
      status: "ativo",
      totalVisits: 0,
      totalSpentCents: 0,
      createdBy: userId as Id<"users">,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await audit(ctx, org._id, userId, {
      action: "criou",
      module: "Clientes",
      recordType: "clients",
      recordId: id,
      summary: `Cliente "${args.name}" cadastrado`,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.id("clients"),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    birthDate: v.optional(v.string()),
    gender: v.optional(v.string()),
    preferredBarberId: v.optional(v.id("barbers")),
    tags: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    consentMarketing: v.optional(v.boolean()),
    status: v.optional(v.union(v.literal("ativo"), v.literal("inativo"))),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "clients");
    const client = await ctx.db.get(args.clientId);
    if (!client || client.organizationId !== org._id) bad("Cliente não encontrado.");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const key of ["name", "phone", "email", "birthDate", "gender", "tags", "notes", "consentMarketing", "status"] as const) {
      if (args[key] !== undefined) patch[key] = args[key];
    }
    if (args.preferredBarberId !== undefined) patch.preferredBarberId = args.preferredBarberId;
    await ctx.db.patch(client._id, patch);
    await audit(ctx, org._id, userId, {
      action: "atualizou",
      module: "Clientes",
      recordType: "clients",
      recordId: client._id,
      summary: `Cadastro de "${client.name}" atualizado`,
    });
  },
});

export const remove = mutation({
  args: { organizationId: v.id("organizations"), clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "clients");
    const client = await ctx.db.get(args.clientId);
    if (!client || client.organizationId !== org._id) bad("Cliente não encontrado.");
    const sales = await ctx.db
      .query("sales")
      .withIndex("by_org_client", (q) =>
        q.eq("organizationId", org._id).eq("clientId", args.clientId),
      )
      .first();
    if (sales) {
      await ctx.db.patch(client._id, { status: "inativo", updatedAt: Date.now() });
      await audit(ctx, org._id, userId, {
        action: "arquivou",
        module: "Clientes",
        recordType: "clients",
        recordId: client._id,
        summary: `Cliente "${client.name}" arquivado (possui histórico financeiro)`,
      });
      return;
    }
    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_org_client", (q) =>
        q.eq("organizationId", org._id).eq("clientId", args.clientId),
      )
      .first();
    if (appointments) bad("O cliente possui agendamentos e não pode ser excluído. Archive-o.");
    await ctx.db.delete(client._id);
    await audit(ctx, org._id, userId, {
      action: "excluiu",
      module: "Clientes",
      recordType: "clients",
      summary: `Cliente "${client.name}" excluído`,
    });
  },
});

export const addNote = mutation({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.id("clients"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "clients");
    if (!args.body.trim()) bad("Escreva a anotação.");
    const client = await ctx.db.get(args.clientId);
    if (!client || client.organizationId !== org._id) bad("Cliente não encontrado.");
    const id = await ctx.db.insert("clientNotes", {
      organizationId: org._id,
      clientId: args.clientId,
      body: args.body.trim(),
      userId: userId as Id<"users">,
      createdAt: Date.now(),
    });
    await audit(ctx, org._id, userId, {
      action: "anotou",
      module: "Clientes",
      recordType: "clients",
      recordId: args.clientId,
      summary: `Anotação adicionada ao cliente "${client.name}"`,
    });
    return id;
  },
});