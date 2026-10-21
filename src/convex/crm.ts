import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { audit, bad, requireManage, requireSameOrg, requireView } from "./lib";
import { requiredText, text } from "./validation";
import { addDaysISO, birthdayWithin, daysBetween, todayISO } from "../lib/dates";

/* ------------------------------ follow-ups ------------------------------ */

export const listFollowups = query({
  args: {
    organizationId: v.id("organizations"),
    status: v.optional(
      v.union(v.literal("pendente"), v.literal("em_andamento"), v.literal("concluido"), v.literal("descartado")),
    ),
    priority: v.optional(v.union(v.literal("baixa"), v.literal("media"), v.literal("alta"))),
    clientId: v.optional(v.id("clients")),
    onlyOverdue: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireView(ctx, args.organizationId, "crm");
    const rows = await ctx.db
      .query("followups")
      .withIndex("by_org_status", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const today = todayISO();
    const filtered = rows
      .filter((f) => (args.status ? f.status === args.status : f.status !== "descartado"))
      .filter((f) => (args.priority ? f.priority === args.priority : true))
      .filter((f) => (args.clientId ? f.clientId === args.clientId : true))
      .filter((f) => (args.onlyOverdue ? f.dueDate < today && f.status !== "concluido" : true));

    const out = [];
    for (const f of filtered.sort((a, b) => {
      const order = { alta: 0, media: 1, baixa: 2 } as Record<string, number>;
      const p = (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
      if (p !== 0) return p;
      return a.dueDate.localeCompare(b.dueDate);
    })) {
      const client = await ctx.db.get(f.clientId);
      out.push({
        ...f,
        clientName: client?.name ?? "—",
        clientPhone: client?.phone ?? "",
        overdue: f.dueDate < today && f.status !== "concluido",
      });
    }
    return out.slice(0, 300);
  },
});

export const createFollowup = mutation({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.id("clients"),
    reason: v.union(
      v.literal("inatividade"),
      v.literal("aniversario"),
      v.literal("renovacao"),
      v.literal("falta"),
      v.literal("pos_atendimento"),
      v.literal("personalizado"),
    ),
    title: v.string(),
    notes: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    priority: v.optional(v.union(v.literal("baixa"), v.literal("media"), v.literal("alta"))),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "crm");
    if (!args.title.trim()) bad("Informe o título da tarefa.");
    await requireSameOrg(await ctx.db.get(args.clientId), org._id, "Cliente");
    const title = requiredText(args.title, "name", "Título da tarefa");
    const id = await ctx.db.insert("followups", {
      organizationId: org._id,
      clientId: args.clientId,
      reason: args.reason,
      title,
      notes: text(args.notes, "note", "Observações"),
      ownerId: userId as Id<"users">,
      dueDate: args.dueDate ?? todayISO(),
      priority: args.priority ?? "media",
      status: "pendente",
      createdAt: Date.now(),
    });
    await audit(ctx, org._id, userId, {
      action: "criou",
      module: "Relacionamento",
      recordType: "followups",
      recordId: id,
      summary: `Follow-up criado: ${title}`,
    });
    return id;
  },
});

export const updateFollowup = mutation({
  args: {
    organizationId: v.id("organizations"),
    followupId: v.id("followups"),
    status: v.optional(
      v.union(v.literal("pendente"), v.literal("em_andamento"), v.literal("concluido"), v.literal("descartado")),
    ),
    priority: v.optional(v.union(v.literal("baixa"), v.literal("media"), v.literal("alta"))),
    dueDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "crm");
    const f = await ctx.db.get(args.followupId);
    if (!f || f.organizationId !== org._id) bad("Follow-up não encontrado.");
    const patch: Record<string, unknown> = {};
    if (args.status !== undefined) {
      patch.status = args.status;
      if (args.status === "concluido") patch.completedAt = Date.now();
    }
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.dueDate !== undefined) patch.dueDate = args.dueDate;
    if (args.notes !== undefined) patch.notes = args.notes;
    await ctx.db.patch(f._id, patch);
    await audit(ctx, org._id, userId, {
      action: "atualizou",
      module: "Relacionamento",
      recordType: "followups",
      recordId: f._id,
      summary: `Follow-up "${f.title}" → ${args.status ?? "editado"}`,
    });
  },
});

/** Gera sugestões automáticas de relacionamento sem duplicar tarefas abertas. */
export const generateSuggestions = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "crm");
    const today = todayISO();
    const clients = await ctx.db
      .query("clients")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const existing = await ctx.db
      .query("followups")
      .withIndex("by_org_status", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const open = new Set(
      existing
        .filter((f) => f.status === "pendente" || f.status === "em_andamento")
        .map((f) => `${f.clientId}:${f.reason}`),
    );

    let created = 0;
    for (const client of clients) {
      if (client.status !== "ativo") continue;

      // inatividade
      const inactiveDays = client.lastVisitDate ? daysBetween(client.lastVisitDate, today) : null;
      if (
        inactiveDays !== null &&
        inactiveDays > org.settings.inactivityDays &&
        !open.has(`${client._id}:inatividade`)
      ) {
        await ctx.db.insert("followups", {
          organizationId: org._id,
          clientId: client._id,
          reason: "inatividade",
          title: `${client.name} está ${inactiveDays} dias sem atendimento`,
          notes: "Oferecer reativação (desconto ou cortesia).",
          ownerId: userId as Id<"users">,
          dueDate: today,
          priority: inactiveDays > 90 ? "alta" : "media",
          status: "pendente",
          createdAt: Date.now(),
        });
        created++;
      }

      // aniversário nos próximos 7 dias
      if (
        client.birthDate &&
        birthdayWithin(client.birthDate, today, 7) &&
        !open.has(`${client._id}:aniversario`)
      ) {
        await ctx.db.insert("followups", {
          organizationId: org._id,
          clientId: client._id,
          reason: "aniversario",
          title: `Aniversário de ${client.name}`,
          notes: "Parabéns pelo WhatsApp com cortesia.",
          ownerId: userId as Id<"users">,
          dueDate: client.birthDate,
          priority: "media",
          status: "pendente",
          createdAt: Date.now(),
        });
        created++;
      }
    }


    await audit(ctx, org._id, userId, {
      action: "gerou",
      module: "Relacionamento",
      recordType: "followups",
      summary: `${created} sugestão(ões) de relacionamento gerada(s)`,
    });
    return created;
  },
});

/* ------------------------------ feedback ------------------------------ */

export const listFeedback = query({
  args: {
    organizationId: v.id("organizations"),
    barberId: v.optional(v.id("barbers")),
  },
  handler: async (ctx, args) => {
    await requireView(ctx, args.organizationId, "crm");
    const rows = await ctx.db
      .query("feedback")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const filtered = rows.filter((f) => (args.barberId ? f.barberId === args.barberId : true));

    const byBarber = new Map<string, { sum: number; count: number }>();
    const byService = new Map<string, { sum: number; count: number }>();
    for (const f of filtered) {
      if (f.barberId) {
        const e = byBarber.get(f.barberId as string) ?? { sum: 0, count: 0 };
        e.sum += f.rating;
        e.count += 1;
        byBarber.set(f.barberId as string, e);
      }
      if (f.serviceId) {
        const e = byService.get(f.serviceId as string) ?? { sum: 0, count: 0 };
        e.sum += f.rating;
        e.count += 1;
        byService.set(f.serviceId as string, e);
      }
    }

    const barberRatings = [];
    for (const [barberId, e] of byBarber) {
      const barber = await ctx.db.get(barberId as Id<"barbers">);
      barberRatings.push({ barberId, barberName: barber?.name ?? "—", average: e.sum / e.count, count: e.count });
    }
    const serviceRatings = [];
    for (const [serviceId, e] of byService) {
      const service = await ctx.db.get(serviceId as Id<"services">);
      serviceRatings.push({ serviceId, serviceName: service?.name ?? "—", average: e.sum / e.count, count: e.count });
    }

    const detailed = [];
    for (const f of filtered.sort((a, b) => b.createdAt - a.createdAt).slice(0, 60)) {
      const [client, barber, service] = await Promise.all([
        ctx.db.get(f.clientId),
        f.barberId ? ctx.db.get(f.barberId) : null,
        f.serviceId ? ctx.db.get(f.serviceId) : null,
      ]);
      detailed.push({
        ...f,
        clientName: client?.name ?? "—",
        clientPhone: client?.phone ?? "",
        barberName: barber?.name ?? "—",
        serviceName: service?.name ?? "—",
      });
    }

    return {
      feedback: detailed,
      average: filtered.length > 0 ? filtered.reduce((s, f) => s + f.rating, 0) / filtered.length : 0,
      count: filtered.length,
      byBarber: barberRatings.sort((a, b) => b.average - a.average),
      byService: serviceRatings.sort((a, b) => b.average - a.average),
      distribution: [5, 4, 3, 2, 1].map((rating) => ({
        rating,
        count: filtered.filter((f) => Math.round(f.rating) === rating).length,
      })),
    };
  },
});

export const createFeedback = mutation({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.id("clients"),
    appointmentId: v.optional(v.id("appointments")),
    barberId: v.optional(v.id("barbers")),
    serviceId: v.optional(v.id("services")),
    rating: v.number(),
    comment: v.optional(v.string()),
    internalNotes: v.optional(v.string()),
    date: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "crm");
    if (args.rating < 1 || args.rating > 5) bad("Nota inválida (1 a 5).");
    const client = await requireSameOrg(await ctx.db.get(args.clientId), org._id, "Cliente");
    if (args.barberId) await requireSameOrg(await ctx.db.get(args.barberId), org._id, "Barbeiro");
    if (args.serviceId) await requireSameOrg(await ctx.db.get(args.serviceId), org._id, "Serviço");
    if (args.appointmentId)
      await requireSameOrg(await ctx.db.get(args.appointmentId), org._id, "Agendamento");
    const id = await ctx.db.insert("feedback", {
      organizationId: org._id,
      clientId: args.clientId,
      appointmentId: args.appointmentId,
      barberId: args.barberId,
      serviceId: args.serviceId,
      rating: args.rating,
      comment: text(args.comment, "note", "Comentário"),
      internalNotes: text(args.internalNotes, "note", "Observações internas"),
      date: args.date ?? todayISO(),
      createdAt: Date.now(),
    });
    await audit(ctx, org._id, userId, {
      action: "criou",
      module: "Feedback",
      recordType: "feedback",
      recordId: id,
      summary: `Avaliação ${args.rating}★ de ${client.name}`,
    });
    if (args.rating <= 3) {
      await ctx.db.insert("followups", {
        organizationId: org._id,
        clientId: args.clientId,
        reason: "pos_atendimento",
        title: `Recuperar ${client.name} (nota ${args.rating})`,
        notes: args.comment,
        ownerId: userId as Id<"users">,
        dueDate: addDaysISO(todayISO(), 1),
        priority: "alta",
        status: "pendente",
        createdAt: Date.now(),
      });
    }
    return id;
  },
});