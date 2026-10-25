import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { audit, bad, requireMember } from "./lib";
import { requireCommercialWriteAccess } from "./commercial";
import { addDaysISO, todayISO } from "../lib/dates";

/** O profissional é sempre resolvido a partir da sessão, nunca do navegador. */
async function ownBarber(ctx: QueryCtx | MutationCtx, orgId: Id<"organizations">) {
  const member = await requireMember(ctx, orgId);
  if (member.role !== "barber") bad("Área exclusiva do perfil Barbeiro.");
  if (!member.member.barberId) return { ...member, barber: null };
  const barber = await ctx.db.get(member.member.barberId);
  if (!barber || barber.organizationId !== orgId)
    bad("Vínculo profissional inválido. Contate o proprietário.");
  return { ...member, barber };
}

export const myWorkspace = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const { barber, org } = await ownBarber(ctx, organizationId);
    if (!barber) return {
      linked: false as const, organizationName: org.name, profile: null,
      appointments: [], commissions: [],
      totals: { totalCents: 0, pendingCents: 0, paidCents: 0 },
    };

    const today = todayISO();
    const appointmentsRaw = await ctx.db.query("appointments")
      .withIndex("by_org_barber_date", q =>
        q.eq("organizationId", organizationId).eq("barberId", barber._id)
          .gte("date", addDaysISO(today, -7)).lte("date", addDaysISO(today, 30)),
      ).take(180);
    const appointments = await Promise.all(appointmentsRaw.map(async a => {
      const client = await ctx.db.get(a.clientId);
      const service = await ctx.db.get(a.serviceId);
      return {
        id: a._id, date: a.date, startTime: a.startTime, durationMin: a.durationMin,
        status: a.status, paymentStatus: a.paymentStatus,
        clientName: client?.organizationId === organizationId ? client.name : "Cliente",
        serviceName: service?.organizationId === organizationId ? service.name : "Serviço",
      };
    }));

    const allCommissions = await ctx.db.query("commissions")
      .withIndex("by_org_barber", q =>
        q.eq("organizationId", organizationId).eq("barberId", barber._id),
      ).take(300);
    const own = allCommissions.filter(c =>
      c.date >= addDaysISO(today, -30) && c.date <= today);
    const commissions = own.map(c => ({
      id: c._id, date: c.date, description: c.description,
      amountCents: c.amountCents, status: c.status,
    })).sort((a, b) => b.date.localeCompare(a.date));

    return {
      linked: true as const, organizationName: org.name,
      profile: { name: barber.name, jobTitle: barber.jobTitle ?? "Barbeiro" },
      appointments: appointments.sort((a, b) =>
        (a.date + a.startTime).localeCompare(b.date + b.startTime)),
      commissions,
      totals: {
        totalCents: own.reduce((s, c) => s + c.amountCents, 0),
        pendingCents: own.filter(c => c.status !== "paga").reduce((s, c) => s + c.amountCents, 0),
        paidCents: own.filter(c => c.status === "paga").reduce((s, c) => s + c.amountCents, 0),
      },
    };
  },
});

/** Permite apenas confirmar ou iniciar atendimentos do usuário. Nunca cobrar. */
export const updateMyAppointment = mutation({
  args: {
    organizationId: v.id("organizations"),
    appointmentId: v.id("appointments"),
    status: v.union(v.literal("confirmado"), v.literal("em_atendimento")),
  },
  handler: async (ctx, args) => {
    const { barber, org, userId } = await ownBarber(ctx, args.organizationId);
    if (!barber) bad("Seu perfil ainda não está vinculado a um barbeiro.");
    await requireCommercialWriteAccess(ctx, org);
    const appointment = await ctx.db.get(args.appointmentId);
    if (!appointment || appointment.organizationId !== org._id || appointment.barberId !== barber._id)
      bad("Atendimento não encontrado para seu perfil.");
    if (appointment.saleId || appointment.paymentStatus === "pago")
      bad("Atendimento já finalizado no PDV.");
    const valid = (appointment.status === "agendado" && args.status === "confirmado") ||
      (appointment.status === "confirmado" && args.status === "em_atendimento");
    if (!valid) bad("Mudança de status não permitida. A cobrança é exclusiva do PDV.");
    await ctx.db.patch(appointment._id, { status: args.status, updatedAt: Date.now() });
    await audit(ctx, org._id, userId, {
      action: "atualizou", module: "Minha agenda", recordType: "appointments",
      recordId: appointment._id, summary: "Status do atendimento atualizado pelo barbeiro",
    });
  },
});
