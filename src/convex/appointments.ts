import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  audit,
  bad,
  notify,
  requireManage,
  requireSameOrg,
  requireView,
} from "./lib";
import { text } from "./validation";
import { timeToMin, todayISO, weekdayOf } from "../lib/dates";
import { recordSale } from "./sales";

const ACTIVE_STATUSES = ["agendado", "confirmado", "em_atendimento"] as const;

async function assertNoConflict(
  ctx: Parameters<typeof requireManage>[0],
  args: {
    organizationId: Id<"organizations">;
    barberId: Id<"barbers">;
    date: string;
    startTime: string;
    durationMin: number;
    ignoreId?: Id<"appointments">;
  },
): Promise<void> {
  const sameDay = await ctx.db
    .query("appointments")
    .withIndex("by_org_barber_date", (q) =>
      q
        .eq("organizationId", args.organizationId)
        .eq("barberId", args.barberId)
        .eq("date", args.date),
    )
    .collect();
  const start = timeToMin(args.startTime);
  const end = start + args.durationMin;
  for (const other of sameDay) {
    if (args.ignoreId && other._id === args.ignoreId) continue;
    if (!ACTIVE_STATUSES.includes(other.status as never)) continue;
    const oStart = timeToMin(other.startTime);
    const oEnd = oStart + other.durationMin;
    if (start < oEnd && oStart < end) {
      const client = await ctx.db.get(other.clientId);
      const service = await ctx.db.get(other.serviceId);
      bad(
        `Conflito de horário: já existe ${service?.name ?? "atendimento"} das ${other.startTime} às ${fmtTime(oEnd)} para ${client?.name ?? "cliente"}.`,
      );
    }
  }
}

function fmtTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

async function assertWithinHours(
  ctx: Parameters<typeof requireManage>[0],
  barberId: Id<"barbers">,
  date: string,
  startTime: string,
  durationMin: number,
): Promise<void> {
  const barber = await ctx.db.get(barberId);
  if (!barber) bad("Barbeiro não encontrado.");
  const day = barber.schedule.find((s) => s.weekday === weekdayOf(date));
  if (!day || !day.enabled) bad(`${barber.name} não atende neste dia da semana.`);
  const start = timeToMin(startTime);
  const end = start + durationMin;
  if (start < timeToMin(day.start) || end > timeToMin(day.end))
    bad(
      `Horário fora do expediente de ${barber.name} (${day.start} às ${day.end}). Ajuste o horário de trabalho em Barbeiros.`,
    );
}

/* ------------------------------ consultas ------------------------------ */

export const agenda = query({
  args: {
    organizationId: v.id("organizations"),
    from: v.string(),
    to: v.string(),
    barberId: v.optional(v.id("barbers")),
  },
  handler: async (ctx, { organizationId, from, to, barberId }) => {
    await requireView(ctx, organizationId, "agenda");
    const rows = await ctx.db
      .query("appointments")
      .withIndex("by_org_date", (q) => q.eq("organizationId", organizationId))
      .collect();
    const filtered = rows
      .filter((a) => a.date >= from && a.date <= to)
      .filter((a) => (barberId ? a.barberId === barberId : true))
      .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
    const out = [];
    for (const a of filtered) {
      const [client, barber, service] = await Promise.all([
        ctx.db.get(a.clientId),
        ctx.db.get(a.barberId),
        ctx.db.get(a.serviceId),
      ]);
      out.push({
        ...a,
        clientName: client?.name ?? "—",
        clientPhone: client?.phone ?? "",
        barberName: barber?.name ?? "—",
        barberColor: barber?.color ?? "#64748b",
        serviceName: service?.name ?? "—",
      });
    }
    return out;
  },
});

export const appointmentDetail = query({
  args: { organizationId: v.id("organizations"), appointmentId: v.id("appointments") },
  handler: async (ctx, { organizationId, appointmentId }) => {
    await requireView(ctx, organizationId, "agenda");
    const appointment = await ctx.db.get(appointmentId);
    if (!appointment || appointment.organizationId !== organizationId)
      bad("Agendamento não encontrado.");
    const [client, barber, service] = await Promise.all([
      ctx.db.get(appointment.clientId),
      ctx.db.get(appointment.barberId),
      ctx.db.get(appointment.serviceId),
    ]);
    return { appointment, client, barber, service };
  },
});

export const listWaitlist = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireView(ctx, organizationId, "agenda");
    const rows = await ctx.db
      .query("waitlist")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .collect();
    const out = [];
    for (const w of rows) {
      const client = await ctx.db.get(w.clientId);
      const barber = w.barberId ? await ctx.db.get(w.barberId) : null;
      const service = w.serviceId ? await ctx.db.get(w.serviceId) : null;
      out.push({
        ...w,
        clientName: client?.name ?? "—",
        clientPhone: client?.phone ?? "",
        barberName: barber?.name ?? "—",
        serviceName: service?.name ?? "—",
      });
    }
    return out.sort((a, b) => a.createdAt - b.createdAt);
  },
});

/* ------------------------------ mutações ------------------------------ */

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.id("clients"),
    barberId: v.id("barbers"),
    serviceId: v.id("services"),
    date: v.string(),
    startTime: v.string(),
    notes: v.optional(v.string()),
    source: v.optional(
      v.union(v.literal("balcao"), v.literal("whatsapp"), v.literal("telefone"), v.literal("online"), v.literal("indicacao")),
    ),
    status: v.optional(v.union(v.literal("agendado"), v.literal("confirmado"))),
    priceCents: v.optional(v.number()),
    durationMin: v.optional(v.number()),
    ignoreHours: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "agenda");
    const service = await ctx.db.get(args.serviceId);
    if (!service || service.organizationId !== org._id) bad("Serviço não encontrado.");
    const client = await requireSameOrg(await ctx.db.get(args.clientId), org._id, "Cliente");
    await requireSameOrg(await ctx.db.get(args.barberId), org._id, "Barbeiro");
    const duration = args.durationMin ?? service.durationMin;
    if (duration <= 0 || duration > 480) bad("Duração do atendimento inválida.");
    if (args.date < todayISO()) bad("Não é possível agendar para uma data passada.");

    await assertNoConflict(ctx, {
      organizationId: org._id,
      barberId: args.barberId,
      date: args.date,
      startTime: args.startTime,
      durationMin: duration,
    });
    if (!args.ignoreHours) {
      await assertWithinHours(ctx, args.barberId, args.date, args.startTime, duration);
    }

    const id = await ctx.db.insert("appointments", {
      organizationId: org._id,
      clientId: args.clientId,
      barberId: args.barberId,
      serviceId: args.serviceId,
      date: args.date,
      startTime: args.startTime,
      durationMin: duration,
      priceCents: args.priceCents ?? service.priceCents,
      status: args.status ?? "agendado",
      paymentStatus: "nao_pago",
      notes: text(args.notes, "note", "Observações"),
      source: args.source ?? "balcao",
      createdBy: userId as Id<"users">,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await audit(ctx, org._id, userId, {
      action: "criou",
      module: "Agenda",
      recordType: "appointments",
      recordId: id,
      summary: `Agendamento de ${client.name} (${service.name}) em ${args.date} ${args.startTime}`,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    appointmentId: v.id("appointments"),
    barberId: v.optional(v.id("barbers")),
    serviceId: v.optional(v.id("services")),
    date: v.optional(v.string()),
    startTime: v.optional(v.string()),
    durationMin: v.optional(v.number()),
    notes: v.optional(v.string()),
    priceCents: v.optional(v.number()),
    ignoreHours: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "agenda");
    const appt = await ctx.db.get(args.appointmentId);
    if (!appt || appt.organizationId !== org._id) bad("Agendamento não encontrado.");
    if (appt.status === "concluido") bad("Atendimento concluído não pode ser alterado.");
    const barberId = args.barberId ?? appt.barberId;
    const date = args.date ?? appt.date;
    const startTime = args.startTime ?? appt.startTime;
    const duration = args.durationMin ?? appt.durationMin;
    if (args.barberId) await requireSameOrg(await ctx.db.get(args.barberId), org._id, "Barbeiro");
    if (args.serviceId) await requireSameOrg(await ctx.db.get(args.serviceId), org._id, "Serviço");
    const service = args.serviceId ? await ctx.db.get(args.serviceId) : await ctx.db.get(appt.serviceId);
    const price = args.priceCents ?? (args.serviceId ? (service?.priceCents ?? appt.priceCents) : appt.priceCents);

    await assertNoConflict(ctx, {
      organizationId: org._id,
      barberId,
      date,
      startTime,
      durationMin: duration,
      ignoreId: appt._id,
    });
    if (!args.ignoreHours) await assertWithinHours(ctx, barberId, date, startTime, duration);

    await ctx.db.patch(appt._id, {
      barberId,
      serviceId: args.serviceId ?? appt.serviceId,
      date,
      startTime,
      durationMin: duration,
      priceCents: price,
      notes: text(args.notes, "note", "Observações") ?? appt.notes,
      updatedAt: Date.now(),
    });
    await audit(ctx, org._id, userId, {
      action: "atualizou",
      module: "Agenda",
      recordType: "appointments",
      recordId: appt._id,
      summary: `Agendamento movido para ${date} ${startTime}`,
    });
  },
});

export const setStatus = mutation({
  args: {
    organizationId: v.id("organizations"),
    appointmentId: v.id("appointments"),
    status: v.union(
      v.literal("agendado"),
      v.literal("confirmado"),
      v.literal("em_atendimento"),
      v.literal("cancelado"),
      v.literal("falta"),
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "agenda");
    const appt = await ctx.db.get(args.appointmentId);
    if (!appt || appt.organizationId !== org._id) bad("Agendamento não encontrado.");
    if (appt.status === "concluido") bad("Use a visão de venda para concluir atendimentos pagos.");
    const client = await ctx.db.get(appt.clientId);
    await ctx.db.patch(appt._id, {
      status: args.status,
      notes: text(args.notes, "note", "Observações") ?? appt.notes,
      updatedAt: Date.now(),
    });
    await audit(ctx, org._id, userId, {
      action: args.status === "cancelado" ? "cancelou" : "atualizou",
      module: "Agenda",
      recordType: "appointments",
      recordId: appt._id,
      summary: `Agendamento marcado como ${args.status}`,
    });
    if (args.status === "falta" && client) {
      await ctx.db.insert("followups", {
        organizationId: org._id,
        clientId: appt.clientId,
        reason: "falta",
        title: `Recuperar ${client.name} após falta`,
        notes: "Cliente faltou ao horário marcado.",
        ownerId: userId as Id<"users">,
        dueDate: todayISO(),
        priority: "alta",
        status: "pendente",
        createdAt: Date.now(),
      });
      await notify(ctx, org._id, {
        type: "falta",
        title: "Falta registrada",
        message: `${client.name} faltou ao atendimento de ${appt.date} ${appt.startTime}.`,
        severity: "alerta",
        dedupKey: `falta:${appt._id}`,
        link: "/app/relacionamento",
      });
    }
  },
});

/** Conclui o atendimento gerando venda real (comissão, fidelidade, estoque, caixa). */
export const complete = mutation({
  args: {
    organizationId: v.id("organizations"),
    appointmentId: v.id("appointments"),
    payments: v.array(
      v.object({
        method: v.union(v.literal("dinheiro"), v.literal("debito"), v.literal("credito"), v.literal("pix")),
        amountCents: v.number(),
      }),
    ),
    clientPackageId: v.optional(v.id("clientPackages")),
    membershipId: v.optional(v.id("memberships")),
    discountCents: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "agenda");
    const appt = await ctx.db.get(args.appointmentId);
    if (!appt || appt.organizationId !== org._id) bad("Agendamento não encontrado.");
    if (appt.status === "concluido") bad("Este atendimento já foi concluído.");
    if (appt.status === "cancelado") bad("Atendimento cancelado não pode ser concluído.");

    if (args.clientPackageId && args.membershipId) {
      bad(
        "Escolha um pacote ou uma assinatura para este atendimento, não ambos.",
      );
    }

    const service = await ctx.db.get(appt.serviceId);
    const client = await ctx.db.get(appt.clientId);

    const creditUsed = args.clientPackageId ?? args.membershipId;
    const covered = creditUsed ? appt.priceCents : 0;
    const moneyPayments = creditUsed
      ? args.payments.filter((p) => p.amountCents > 0)
      : args.payments;

    const sale = await recordSale(ctx, org, userId as Id<"users">, {
      date: todayISO(),
      clientId: appt.clientId,
      barberId: appt.barberId,
      appointmentId: appt._id,
      discountCents: args.discountCents,
      notes: text(args.notes, "note", "Observações") ?? appt.notes,
      items: [
        {
          kind: "servico",
          refId: appt.serviceId,
          qty: 1,
          unitPriceCents: appt.priceCents,
          barberId: appt.barberId,
          coveredByCreditCents: covered,
          clientPackageId: args.clientPackageId,
          membershipId: args.membershipId,
        },
      ],
      payments: moneyPayments,
    });

    await ctx.db.patch(appt._id, {
      status: "concluido",
      paymentStatus: "pago",
      saleId: sale.saleId,
      updatedAt: Date.now(),
    });
    await audit(ctx, org._id, userId, {
      action: "concluiu",
      module: "Agenda",
      recordType: "appointments",
      recordId: appt._id,
      summary: `Atendimento concluído: ${client?.name ?? "cliente"} / ${service?.name ?? "serviço"} — R$ ${(sale.totalCents / 100).toFixed(2)}`,
    });
    return sale;
  },
});

/* ------------------------------ lista de espera ------------------------------ */

export const addToWaitlist = mutation({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.id("clients"),
    serviceId: v.optional(v.id("services")),
    barberId: v.optional(v.id("barbers")),
    preferredDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "agenda");
    await requireSameOrg(await ctx.db.get(args.clientId), org._id, "Cliente");
    if (args.serviceId) await requireSameOrg(await ctx.db.get(args.serviceId), org._id, "Serviço");
    if (args.barberId) await requireSameOrg(await ctx.db.get(args.barberId), org._id, "Barbeiro");
    const id = await ctx.db.insert("waitlist", {
      organizationId: org._id,
      clientId: args.clientId,
      serviceId: args.serviceId,
      barberId: args.barberId,
      preferredDate: args.preferredDate,
      notes: text(args.notes, "note", "Observações"),
      status: "aguardando",
      createdAt: Date.now(),
    });
    await audit(ctx, org._id, userId, {
      action: "adicionou",
      module: "Lista de espera",
      recordType: "waitlist",
      recordId: id,
      summary: "Cliente adicionado à lista de espera",
    });
    return id;
  },
});

export const updateWaitlist = mutation({
  args: {
    organizationId: v.id("organizations"),
    waitlistId: v.id("waitlist"),
    status: v.union(v.literal("aguardando"), v.literal("atendido"), v.literal("cancelado")),
  },
  handler: async (ctx, args) => {
    const { org } = await requireManage(ctx, args.organizationId, "agenda");
    const row = await ctx.db.get(args.waitlistId);
    if (!row || row.organizationId !== org._id) bad("Registro não encontrado.");
    await ctx.db.patch(row._id, { status: args.status });
  },
});