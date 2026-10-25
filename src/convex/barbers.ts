import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { audit, bad, requireManage, requireSameOrg, requireView } from "./lib";
import { dateISO, hexColor, requiredText, text, timeLabel } from "./validation";

const scheduleValidator = v.array(
  v.object({ weekday: v.number(), enabled: v.boolean(), start: v.string(), end: v.string() }),
);

type ScheduleDay = { weekday: number; enabled: boolean; start: string; end: string };

/**
 * Valida o expediente do barbeiro: dias únicos, horários no formato 24h e
 * fim depois do início. Um expediente invertido (fim < início) faria o cálculo
 * de conflito de agenda rejeitar todos os horários reais do dia.
 */
function normalizeSchedule(days: ScheduleDay[] | undefined): ScheduleDay[] | undefined {
  if (days === undefined) return undefined;
  if (days.length === 0) bad("Informe ao menos um dia de expediente.");
  const seen = new Set<number>();
  return days.map((day) => {
    if (!Number.isInteger(day.weekday) || day.weekday < 0 || day.weekday > 6)
      bad("Dia da semana inválido no expediente.");
    if (seen.has(day.weekday)) bad("Há dias repetidos no expediente.");
    seen.add(day.weekday);
    const start = timeLabel(day.start, "Início do expediente");
    const end = timeLabel(day.end, "Fim do expediente");
    if (day.enabled && end <= start)
      bad("O fim do expediente deve ser depois do início.");
    return { ...day, start, end };
  });
}

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireView(ctx, args.organizationId, "team");
    const rows = await ctx.db
      .query("barbers")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const barbers = args.includeInactive ? rows : rows.filter((b) => b.status === "ativo");
    return barbers.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const performance = query({
  args: {
    organizationId: v.id("organizations"),
    barberId: v.optional(v.id("barbers")),
    from: v.string(),
    to: v.string(),
  },
  handler: async (ctx, args) => {
    await requireView(ctx, args.organizationId, "reports");
    const barbers = await ctx.db
      .query("barbers")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const targets = args.barberId ? barbers.filter((b) => b._id === args.barberId) : barbers;

    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_org_date", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const sales = await ctx.db
      .query("sales")
      .withIndex("by_org_date", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const commissions = await ctx.db
      .query("commissions")
      .withIndex("by_org_date", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const rows = [];
    for (const barber of targets) {
      const mine = appointments.filter(
        (a) => a.barberId === barber._id && a.date >= args.from && a.date <= args.to,
      );
      const completed = mine.filter((a) => a.status === "concluido");
      const cancelled = mine.filter((a) => a.status === "cancelado");
      const noShow = mine.filter((a) => a.status === "falta");
      const mySalesIds = new Set(
        sales.filter((s) => s.barberId === barber._id && s.date >= args.from && s.date <= args.to).map((s) => s._id as string),
      );
      const mySales = sales.filter((s) => mySalesIds.has(s._id as string));
      const revenue = mySales.reduce((s, x) => s + x.totalCents, 0);
      const clientsServed = new Set(completed.map((a) => a.clientId as string)).size;
      const myCommissions = commissions.filter((c) => c.barberId === barber._id && c.date >= args.from && c.date <= args.to);
      rows.push({
        barber,
        appointments: mine.length,
        completed: completed.length,
        cancelled: cancelled.length,
        noShow: noShow.length,
        clientsServed,
        revenueCents: revenue,
        averageTicketCents: mySales.length > 0 ? Math.round(revenue / mySales.length) : 0,
        commissionCents: myCommissions.reduce((s, c) => s + c.amountCents, 0),
        pendingCommissionCents: myCommissions
          .filter((c) => c.status !== "paga")
          .reduce((s, c) => s + c.amountCents, 0),
        paidCommissionCents: myCommissions
          .filter((c) => c.status === "paga")
          .reduce((s, c) => s + c.amountCents, 0),
        completionRate: mine.length > 0 ? Math.round((completed.length / mine.length) * 100) : 0,
      });
    }
    return rows.sort((a, b) => b.revenueCents - a.revenueCents);
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    hireDate: v.optional(v.string()),
    commissionModel: v.optional(v.union(v.literal("herdar"), v.literal("percentual"), v.literal("fixo"))),
    commissionValue: v.optional(v.number()),
    schedule: v.optional(scheduleValidator),
    notes: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "team");
    const name = requiredText(args.name, "name", "Nome do barbeiro");
    const id = await ctx.db.insert("barbers", {
      organizationId: org._id,
      name,
      phone: text(args.phone, "phone", "Telefone"),
      email: text(args.email, "email", "E-mail"),
      jobTitle: text(args.jobTitle, "reference", "Cargo") ?? "Barbeiro",
      status: "ativo",
      hireDate: args.hireDate ? dateISO(args.hireDate, "Data de contratação") : undefined,
      commissionModel: args.commissionModel ?? "herdar",
      commissionValue: args.commissionValue,
      schedule:
        normalizeSchedule(args.schedule) ??
        [1, 2, 3, 4, 5].map((weekday) => ({
          weekday,
          enabled: true,
          start: "09:00",
          end: "19:00",
        })),
      notes: text(args.notes, "note", "Observações"),
      color: hexColor(args.color, "Cor") ?? "#b45309",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await audit(ctx, org._id, userId, {
      action: "criou",
      module: "Equipe",
      recordType: "barbers",
      recordId: id,
      summary: `Barbeiro "${name}" cadastrado`,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    barberId: v.id("barbers"),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    status: v.optional(v.union(v.literal("ativo"), v.literal("inativo"), v.literal("ferias"))),
    hireDate: v.optional(v.string()),
    commissionModel: v.optional(v.union(v.literal("herdar"), v.literal("percentual"), v.literal("fixo"))),
    commissionValue: v.optional(v.number()),
    schedule: v.optional(scheduleValidator),
    notes: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "team");
    const barber = await requireSameOrg(await ctx.db.get(args.barberId), org._id, "Barbeiro");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = requiredText(args.name, "name", "Nome do barbeiro");
    if (args.phone !== undefined) patch.phone = text(args.phone, "phone", "Telefone");
    if (args.email !== undefined) patch.email = text(args.email, "email", "E-mail");
    if (args.jobTitle !== undefined)
      patch.jobTitle = text(args.jobTitle, "reference", "Cargo") ?? "Barbeiro";
    if (args.hireDate !== undefined)
      patch.hireDate = dateISO(args.hireDate, "Data de contratação");
    if (args.schedule !== undefined) patch.schedule = normalizeSchedule(args.schedule);
    if (args.notes !== undefined) patch.notes = text(args.notes, "note", "Observações");
    if (args.color !== undefined) patch.color = hexColor(args.color, "Cor");
    for (const key of [
      "status", "commissionModel", "commissionValue",
    ] as const) {
      if (args[key] !== undefined) patch[key] = args[key];
    }
    await ctx.db.patch(barber._id, patch);
    await audit(ctx, org._id, userId, {
      action: "atualizou",
      module: "Equipe",
      recordType: "barbers",
      recordId: barber._id,
      summary: `Cadastro de "${barber.name}" atualizado`,
    });
  },
});

export const linkToMember = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberId: v.id("organizationMembers"),
    barberId: v.optional(v.id("barbers")),
  },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "team");
    const member = await requireSameOrg(await ctx.db.get(args.memberId), org._id, "Membro");
    if (args.barberId) {
      await requireSameOrg(await ctx.db.get(args.barberId), org._id, "Barbeiro");
      // Uma conta vinculada a um perfil profissional recebe acesso à agenda e
      // às comissões dele. Não permitir que duas contas compartilhem esse acesso.
      const members = await ctx.db.query("organizationMembers")
        .withIndex("by_org", q => q.eq("organizationId", org._id))
        .collect();
      if (members.some(m => m._id !== member._id && m.barberId === args.barberId)) {
        bad("Este barbeiro já está vinculado a outra conta da equipe.");
      }
    }
    if (member.barberId === args.barberId) return;
    await ctx.db.patch(member._id, { barberId: args.barberId });
    await audit(ctx, org._id, userId, {
      action: "atualizou", module: "Equipe", recordType: "organizationMembers",
      recordId: member._id,
      summary: args.barberId ? "Vínculo profissional atualizado" : "Vínculo profissional removido",
    });
  },
});