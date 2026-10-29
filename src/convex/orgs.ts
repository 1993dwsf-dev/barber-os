import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  audit,
  bad,
  requireManage,
  requireMember,
  requireOwner,
  requireUserId,
  requireView,
} from "./lib";
import { getCommercialStatus, isCommercialGateRequired } from "./commercial";
import { APP_ROLES, type AppRole, type Cap } from "../lib/rbac";
import { mayCreateHostedStagingOrganization } from "./auth/accessPolicy";
import { clearRateLimit, consumeRateLimit, enforceRateLimit } from "./rateLimit";
import { requiredText, text } from "./validation";
import { seedDemoData } from "./seed";
import { assertUploadedFile } from "./fileSecurity";

export const DEFAULT_SERVICE_CATEGORIES = ["Cabelo", "Barba", "Combo", "Química", "Estética"];
export const DEFAULT_PRODUCT_CATEGORIES = ["Pomadas", "Óleos", "Shampoos", "Barba", "Acessórios"];
export const DEFAULT_EXPENSE_CATEGORIES = [
  "Aluguel", "Energia", "Água", "Internet", "Insumos", "Marketing",
  "Software", "Manutenção", "Impostos", "Folha de pagamento", "Outros",
];

export const defaultBusinessHours = () =>
  [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    enabled: weekday >= 1 && weekday <= 6,
    start: weekday === 6 ? "09:00" : "09:00",
    end: weekday === 6 ? "18:00" : "19:00",
  }));

export const defaultSettings = () => ({
  activePaymentMethods: ["dinheiro", "debito", "credito", "pix"] as Array<
    "dinheiro" | "debito" | "credito" | "pix"
  >,
  serviceCategories: DEFAULT_SERVICE_CATEGORIES,
  productCategories: DEFAULT_PRODUCT_CATEGORIES,
  expenseCategories: DEFAULT_EXPENSE_CATEGORIES,
  defaultCommissionModel: "percentual" as const,
  defaultCommissionValue: 40,
  loyaltyPointsPerReal: 1,
  loyaltyVisitRule: { visits: 5, points: 30 },
  inactivityDays: 45,
  lowStockAlerts: true,
  cancellationPolicy:
    "Cancelamentos até 3 horas antes do horário agendado. Cancelamentos tardios podem gerar cobrança.",
  noShowPolicy: "Após 2 faltas sem aviso, o agendamento online pode ser suspenso.",
  appointmentSlotMin: 15,
  allowNegativeStock: false,
});

const roleValidator = v.union(...APP_ROLES.map((r) => v.literal(r)));

/* ------------------------------ validação de configurações ------------------------------ */

const PAYMENT_METHODS = ["dinheiro", "debito", "credito", "pix"] as const;

export function stringList(value: unknown, label: string, maxItems: number): string[] {
  if (!Array.isArray(value)) bad(`${label} inválido.`);
  if (value.length > maxItems) bad(`${label}: no máximo ${maxItems} item(ns).`);
  return value.map((item) => {
    if (typeof item !== "string") bad(`${label} inválido.`);
    const trimmed = item.trim();
    if (!trimmed || trimmed.length > 60) bad(`${label} inválido.`);
    return trimmed;
  });
}

function numberIn(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) bad(`${label} inválido.`);
  if (value < min || value > max) bad(`${label} deve estar entre ${min} e ${max}.`);
  return value;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") bad(`${label} inválido.`);
  return value;
}

/**
 * `settings` chega do cliente e antes era gravado com `{ ...org.settings, ...input }`
 * sem nenhuma checagem (`v.any()`). Isso permitia gravar chaves desconhecidas,
 * tipos errados e valores absurdos (ex.: percentual de comissão de 1.000.000).
 * Aqui só passam chaves conhecidas, com tipo e faixa validados.
 */
export function sanitizeSettings(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null) bad("Configurações inválidas.");
  const src = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  if ("activePaymentMethods" in src) {
    const methods = stringList(src.activePaymentMethods, "Formas de pagamento", 8);
    if (methods.length === 0) bad("Mantenha ao menos uma forma de pagamento ativa.");
    for (const method of methods) {
      if (!PAYMENT_METHODS.includes(method as never)) bad(`Forma de pagamento inválida: ${method}.`);
    }
    out.activePaymentMethods = methods;
  }
  if ("serviceCategories" in src)
    out.serviceCategories = stringList(src.serviceCategories, "Categorias de serviço", 40);
  if ("productCategories" in src)
    out.productCategories = stringList(src.productCategories, "Categorias de produto", 40);
  if ("expenseCategories" in src)
    out.expenseCategories = stringList(src.expenseCategories, "Categorias de despesa", 40);

  if ("defaultCommissionModel" in src) {
    const model = src.defaultCommissionModel;
    if (model !== "percentual" && model !== "fixo") bad("Modelo de comissão inválido.");
    out.defaultCommissionModel = model;
  }
  if ("defaultCommissionValue" in src)
    out.defaultCommissionValue = numberIn(
      src.defaultCommissionValue,
      "Valor padrão de comissão",
      0,
      1_000_000,
    );
  if ("loyaltyPointsPerReal" in src)
    out.loyaltyPointsPerReal = numberIn(src.loyaltyPointsPerReal, "Pontos por real", 0, 100);
  if ("loyaltyVisitRule" in src) {
    const rule = src.loyaltyVisitRule;
    if (typeof rule !== "object" || rule === null) bad("Regra de bônus por visitas inválida.");
    const r = rule as Record<string, unknown>;
    out.loyaltyVisitRule = {
      visits: numberIn(r.visits, "Visitas do bônus", 0, 1_000),
      points: numberIn(r.points, "Pontos do bônus", 0, 100_000),
    };
  }
  if ("inactivityDays" in src)
    out.inactivityDays = numberIn(src.inactivityDays, "Dias de inatividade", 1, 3_650);
  if ("appointmentSlotMin" in src)
    out.appointmentSlotMin = numberIn(src.appointmentSlotMin, "Intervalo da agenda", 5, 240);
  if ("lowStockAlerts" in src)
    out.lowStockAlerts = booleanValue(src.lowStockAlerts, "Alerta de estoque mínimo");
  if ("allowNegativeStock" in src)
    out.allowNegativeStock = booleanValue(src.allowNegativeStock, "Estoque negativo");
  if ("cancellationPolicy" in src)
    out.cancellationPolicy = text(String(src.cancellationPolicy ?? ""), "note", "Política de cancelamento") ?? "";
  if ("noShowPolicy" in src)
    out.noShowPolicy = text(String(src.noShowPolicy ?? ""), "note", "Política de faltas") ?? "";

  return out;
}

function randomCode(len = 12): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const max = 256 - (256 % alphabet.length);
  let out = "";

  while (out.length < len) {
    const bytes = new Uint8Array(len * 2);
    crypto.getRandomValues(bytes);

    for (const byte of bytes) {
      if (byte >= max) continue;

      out += alphabet[byte % alphabet.length];

      if (out.length === len) break;
    }
  }

  return out;
}

/**
 * Distribuição de convites exclusivamente administrativa (internal).
 * Em piloto, executar via CLI segura do Convex; nunca no frontend.
 * O código de 256 bits só é retornado ao operador autorizado na criação.
 */
export const issuePilotInvite = internalMutation({
  args: { email: v.string(), trialDays: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      bad("E-mail de convite inválido.");
    const days = args.trialDays ?? 14;
    if (!Number.isInteger(days) || days < 1 || days > 30)
      bad("Duração do piloto inválida.");
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const code = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    const id = await ctx.db.insert("commercialInvites", {
      code, email, trialDays: days, createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 86_400_000,
    });
    return { inviteId: id, code };
  },
});

/** 
 * Acesso para UM cliente operacional após contratação externa.
 * NÃO registra pagamento: emite convite de uso único, vinculado a e-mail verificado.
 * O operador escolhe prazo de acesso manualmente (30-366 dias).
 * Somente callable interno do Convex; NÃO disponível no frontend.
 */
export const issueOperationalInvite = internalMutation({
  args: { email: v.string(), accessDays: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      bad("E-mail de convite inválido.");
    const days = args.accessDays ?? 365;
    if (!Number.isInteger(days) || days < 30 || days > 366)
      bad("O prazo operacional deve estar entre 30 e 366 dias.");
    // Apenas uma barbearia operacional neste piloto: impedir novo convite
    // se outra unidade já utiliza o deployment separado.
    const existing = await ctx.db.query("organizations").take(1);
    if (existing.length > 0)
      bad("O ambiente do primeiro cliente já possui uma barbearia.");
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const code = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    const now = Date.now();
    const inviteId = await ctx.db.insert("commercialInvites", {
      code, email, trialDays: 14, accessDays: days,
      createdAt: now, expiresAt: now + 7 * 86_400_000,
    });
    return { inviteId, code, expiresAt: now + 7 * 86_400_000 };
  },
});

/** Oculta o convite de ingresso e dados de gestão das sessões de barbeiro. */
function redactForBarber(org: Doc<"organizations">): Doc<"organizations"> {
  return {
    ...org,
    inviteCode: "",
    phone: undefined,
    email: undefined,
    address: undefined,
    businessHours: [],
    settings: {
      ...org.settings,
      serviceCategories: [], productCategories: [], expenseCategories: [],
      cancellationPolicy: "", noShowPolicy: "",
    },
  };
}

/* ------------------------------ queries ------------------------------ */

export const myOrganizations = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx).catch(() => null);
    if (!userId) return [];
    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId as Id<"users">))
      .collect();
    const out: Array<{ org: Doc<"organizations">; role: AppRole; memberId: Id<"organizationMembers"> }> = [];
    for (const m of memberships) {
      const org = await ctx.db.get(m.organizationId);
      if (org) out.push({ org: m.role === "barber" ? redactForBarber(org) : org, role: m.role, memberId: m._id });
    }
    return out;
  },
});

export const commercialStatus = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMember(ctx, organizationId);
    return await getCommercialStatus(ctx, organizationId);
  },
});

export const getOrgContext = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const { member, org } = await requireMember(ctx, organizationId);
    return { org: member.role === "barber" ? redactForBarber(org) : org, member };
  },
});

export const listMembers = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireView(ctx, organizationId, "team");
    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .collect();
    const out = [];
    for (const m of members) {
      const user = await ctx.db.get(m.userId);
      out.push({
        _id: m._id,
        role: m.role,
        barberId: m.barberId,
        userId: m.userId,
        name: m.displayName ?? user?.name ?? "(sem nome)",
        email: user?.email ?? "",
      });
    }
    return out;
  },
});

/* ------------------------------ criação / edição ------------------------------ */

export const createOrganization = mutation({
  args: {
    name: v.string(),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    email: v.optional(v.string()),
    pilotInviteCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const user = await ctx.db.get(userId as Id<"users">);

    if (!user) {
      bad("Não foi possível validar sua conta. Entre novamente.");
    }

    if (
      user.isAnonymous ||
      !user.email ||
      !user.emailVerificationTime
    ) {
      bad(
        "Para criar uma barbearia, confirme seu e-mail e use uma conta recuperável. " +
          "Você pode continuar explorando o modo de demonstração.",
      );
    }
    // Usuários convidados para teste via Google devem entrar na unidade
    // existente. A conta extra não pode criar uma nova organização no sandbox.
    if (!mayCreateHostedStagingOrganization(user.email, {
      siteUrl: process.env.CONVEX_SITE_URL ?? "",
      stagingEmail: process.env.BARBER_STAGING_EMAIL,
      stagingGoogleEmails: process.env.BARBER_STAGING_GOOGLE_EMAILS,
      commercialEnabled: process.env.BARBER_AUTH_COMMERCIAL_ENABLED === "true",
    })) {
      bad("Conta de funcionário de teste: use 'Tenho um convite' para entrar na barbearia.");
    }

    // Quando a autenticação comercial OU o paywall estiver habilitado,
    // criar organização exige convite pré-aprovado, de uso único e com prazo.
    const commerce = isCommercialGateRequired();
    let invite: Doc<"commercialInvites"> | null = null;
    if (commerce) {
      const code = args.pilotInviteCode?.trim().toLowerCase();
      if (!code || !/^[0-9a-f]{64}$/.test(code))
        bad("Convite comercial válido é obrigatório.");
      invite = await ctx.db.query("commercialInvites")
        .withIndex("by_code", q => q.eq("code", code)).unique();
      if (!invite || invite.redeemedAt || invite.expiresAt <= Date.now() ||
          invite.email !== user.email.trim().toLowerCase())
        bad("Convite comercial inválido, vencido ou já utilizado.");
    }
    if (invite?.accessDays) {
      const existing = await ctx.db.query("organizations").take(1);
      if (existing.length > 0)
        bad("Este ambiente operacional já está vinculado à primeira barbearia.");
    }
    await enforceRateLimit(ctx, userId, "createOrganization");
    const now = Date.now();
    const name = requiredText(args.name, "name", "Nome da barbearia");
    const orgId = await ctx.db.insert("organizations", {
      name,
      ownerId: userId as Id<"users">,
      phone: text(args.phone, "phone", "Telefone"),
      address: text(args.address, "address", "Endereço"),
      email: text(args.email, "email", "E-mail"),
      businessHours: defaultBusinessHours(),
      settings: defaultSettings(),
      inviteCode: randomCode(),
      isDemo: false,
      salesCount: 0,
      createdAt: now,
      updatedAt: now,
      onboardingStep: 1,
    });
    await ctx.db.insert("organizationMembers", {
      organizationId: orgId,
      userId: userId as Id<"users">,
      role: "owner",
      createdAt: now,
    });
    if (invite) {
      await ctx.db.patch(invite._id, { redeemedAt: now, organizationId: orgId });
      await ctx.db.insert("organizationEntitlements", {
        organizationId: orgId,
        plan: "pilot",
        status: invite.accessDays ? "active" : "trialing",
        ...(invite.accessDays
          ? { periodEndsAt: now + invite.accessDays * 86_400_000 }
          : { trialEndsAt: now + invite.trialDays * 86_400_000 }),
        source: "pilot",
        createdAt: now,
        updatedAt: now,
      });
    }
    await audit(ctx, orgId, userId, {
      action: "criou",
      module: "Organização",
      recordType: "organizations",
      recordId: orgId,
      summary: `Organização "${name}" criada`,
    });
    return orgId;
  },
});

export const updateOrganization = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    email: v.optional(v.string()),
    businessHours: v.optional(
      v.array(
        v.object({ weekday: v.number(), enabled: v.boolean(), start: v.string(), end: v.string() }),
      ),
    ),
    settings: v.optional(v.any()),
  },
  handler: async (ctx, { organizationId, businessHours, settings, ...rest }) => {
    const { userId, org } = await requireManage(ctx, organizationId, "settings");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (rest.name !== undefined) patch.name = requiredText(rest.name, "name", "Nome");
    if (rest.phone !== undefined) patch.phone = text(rest.phone, "phone", "Telefone");
    if (rest.address !== undefined) patch.address = text(rest.address, "address", "Endereço");
    if (rest.email !== undefined) patch.email = text(rest.email, "email", "E-mail");
    if (businessHours) {
      if (businessHours.length > 7) bad("Horário de funcionamento inválido.");
      for (const day of businessHours) {
        if (!Number.isInteger(day.weekday) || day.weekday < 0 || day.weekday > 6)
          bad("Horário de funcionamento inválido.");
        if (typeof day.start !== "string" || typeof day.end !== "string")
          bad("Horário de funcionamento inválido.");
        if (!/^\d{2}:\d{2}$/.test(day.start) || !/^\d{2}:\d{2}$/.test(day.end))
          bad("Use horários no formato HH:MM.");
        if (day.enabled && day.start >= day.end)
          bad("O horário de fechamento precisa ser depois da abertura.");
      }
      patch.businessHours = businessHours;
    }
    if (settings) patch.settings = { ...org.settings, ...sanitizeSettings(settings) };
    await ctx.db.patch(organizationId, patch);
    await audit(ctx, organizationId, userId, {
      action: "atualizou",
      module: "Configurações",
      summary: "Configurações da organização atualizadas",
    });
  },
});

export const setOnboardingStep = mutation({
  args: { organizationId: v.id("organizations"), step: v.optional(v.number()) },
  handler: async (ctx, { organizationId, step }) => {
    const { userId } = await requireOwner(ctx, organizationId);
    if (step !== undefined && (!Number.isInteger(step) || step < 0 || step > 7))
      bad("Etapa de configuração inválida.");
    await ctx.db.patch(organizationId, { onboardingStep: step, updatedAt: Date.now() });
    if (step === undefined) {
      await audit(ctx, organizationId, userId, {
        action: "concluiu",
        module: "Onboarding",
        summary: "Configuração inicial concluída",
      });
    }
  },
});

/* ------------------------------ membros ------------------------------ */

/** Permite que o proprietário ajuste o nome mostrado nesta unidade, sem
 * sobrescrever o nome global da conta nem as credenciais de login. */
export const updateMemberDisplayName = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberId: v.id("organizationMembers"),
    displayName: v.string(),
  },
  handler: async (ctx, { organizationId, memberId, displayName }) => {
    const { userId } = await requireOwner(ctx, organizationId);
    const member = await ctx.db.get(memberId);
    if (!member || member.organizationId !== organizationId) bad("Membro não encontrado.");
    const normalized = requiredText(displayName, "name", "Nome de exibição")
      .replace(/\s+/g, " ");
    if (normalized.length < 2) bad("O nome de exibição deve ter pelo menos 2 caracteres.");
    await ctx.db.patch(memberId, { displayName: normalized });
    await audit(ctx, organizationId, userId, {
      action: "atualizou", module: "Equipe",
      recordType: "organizationMembers", recordId: memberId,
      summary: "Nome de exibição do membro atualizado",
    });
    return normalized;
  },
});

export const updateMemberRole = mutation({
  args: { organizationId: v.id("organizations"), memberId: v.id("organizationMembers"), role: roleValidator },
  handler: async (ctx, { organizationId, memberId, role }) => {
    const { member: me } = await requireOwner(ctx, organizationId);
    const target = await ctx.db.get(memberId);
    if (!target || target.organizationId !== organizationId) bad("Membro não encontrado.");
    if (target.role === "owner" && role !== "owner") {
      const owners = await ctx.db
        .query("organizationMembers")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .filter((q) => q.eq(q.field("role"), "owner"))
        .collect();
      if (owners.length <= 1) bad("A organização precisa de pelo menos um proprietário.");
    }
    await ctx.db.patch(memberId, { role });
    await audit(ctx, organizationId, me.userId, {
      action: "atualizou",
      module: "Equipe",
      recordType: "organizationMembers",
      recordId: memberId,
      summary: `Permissão alterada para ${role}`,
    });
  },
});

export const removeMember = mutation({
  args: { organizationId: v.id("organizations"), memberId: v.id("organizationMembers") },
  handler: async (ctx, { organizationId, memberId }) => {
    const { member: me } = await requireOwner(ctx, organizationId);
    const target = await ctx.db.get(memberId);
    if (!target || target.organizationId !== organizationId) bad("Membro não encontrado.");
    if (target.role === "owner") {
      const owners = await ctx.db
        .query("organizationMembers")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .filter((q) => q.eq(q.field("role"), "owner"))
        .collect();
      if (owners.length <= 1) bad("A organização precisa de pelo menos um proprietário.");
    }
    if (target._id === me._id) bad("Você não pode remover a si mesmo.");
    // Revoga o membro e invalida o código compartilhado numa única transação.
    // Sem essa rotação, a mesma conta pode retornar com o convite que já conhece.
    await ctx.db.delete(memberId);
    const nextInviteCode = randomCode();
    await ctx.db.patch(organizationId, {
      inviteCode: nextInviteCode,
      updatedAt: Date.now(),
    });
    await audit(ctx, organizationId, me.userId, {
      action: "removeu",
      module: "Equipe",
      summary: `Membro removido (${target.role}); código de convite da equipe renovado`,
    });
  },
});

export const regenerateInviteCode = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const { userId } = await requireManage(ctx, organizationId, "settings");
    await enforceRateLimit(ctx, userId, "regenerateInviteCode");
    const code = randomCode();
    await ctx.db.patch(organizationId, { inviteCode: code, updatedAt: Date.now() });
    await audit(ctx, organizationId, userId, {
      action: "gerou",
      module: "Equipe",
      summary: `Novo código de convite gerado`,
    });
    return code;
  },
});

export const joinByInviteCode = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }): Promise<
    { ok: true; organizationId: Id<"organizations"> } | { ok: false; error: string }
  > => {
    const userId = await requireUserId(ctx);

    // Convex reverte toda a transação quando uma mutação lança um erro.
    // Rejeições de convite devem retornar um resultado, para persistir
    // a tentativa e impedir força bruta de códigos de acesso.
    const limitError = await consumeRateLimit(ctx, userId, "joinByInviteCode");
    if (limitError) return { ok: false, error: limitError };

    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(normalized)) {
      return { ok: false, error: "Código de convite inválido." };
    }

    const org = await ctx.db
      .query("organizations")
      .withIndex("by_invite", (q) => q.eq("inviteCode", normalized))
      .first();
    if (!org) return { ok: false, error: "Código de convite inválido." };

    const existing = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId as Id<"users">),
      )
      .first();

    if (!existing) {
      await ctx.db.insert("organizationMembers", {
        organizationId: org._id,
        userId: userId as Id<"users">,
        role: "barber",
        createdAt: Date.now(),
      });
      await audit(ctx, org._id, userId, {
        action: "entrou",
        module: "Equipe",
        summary: "Novo membro entrou via código de convite",
      });
    }
    await clearRateLimit(ctx, userId, "joinByInviteCode");
    return { ok: true, organizationId: org._id };
  },
});

/* ------------------------------ arquivos ------------------------------ */

export const generateUploadUrl = mutation({
  args: {
    organizationId: v.id("organizations"),
    recordType: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, recordType }) => {
    // Fluxos antigos sem tipo são tratados como configuração da unidade.
    const type = (recordType ?? "organizations").trim().toLowerCase();
    const cap = FILE_RECORD_CAPS[type];
    if (!cap) bad("Tipo de anexo não permitido.");
    const { userId } = await requireManage(ctx, organizationId, cap);
    await enforceRateLimit(ctx, userId, "generateUploadUrl");
    return await ctx.storage.generateUploadUrl();
  },
});

/** Limites de anexo compartilhados com a rotina de despesas. */
export { MAX_FILE_BYTES, ALLOWED_FILE_MIME_TYPES } from "./fileSecurity";

/** Módulo ao qual cada tipo de anexo pertence (define quem pode registrar). */
const FILE_RECORD_CAPS: Record<string, Cap> = {
  expenses: "expenses",
  clients: "clients",
  products: "products",
  services: "catalog",
  organizations: "settings",
};

export const recordFile = mutation({
  args: {
    organizationId: v.id("organizations"),
    storageId: v.id("_storage"),
    recordType: v.string(),
    recordId: v.optional(v.string()),
    name: v.string(),
    mimeType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const recordType = args.recordType.trim().toLowerCase();
    const cap = FILE_RECORD_CAPS[recordType];
    if (!cap) bad("Tipo de anexo não permitido.");
    const { userId } = await requireManage(ctx, args.organizationId, cap);
    const name = requiredText(args.name, "name", "Nome do arquivo");
    const mimeType = args.mimeType.trim().toLowerCase();
    const checked = await assertUploadedFile(ctx, {
      organizationId: args.organizationId,
      storageId: args.storageId,
      mimeType,
      size: args.size,
    });
    return await ctx.db.insert("files", {
      organizationId: args.organizationId,
      storageId: args.storageId,
      recordType,
      recordId: args.recordId,
      name,
      mimeType: checked.mimeType,
      size: checked.size,
      uploadedBy: userId as Id<"users">,
      createdAt: Date.now(),
    });
  },
});

export const getFileUrl = query({
  args: { organizationId: v.id("organizations"), storageId: v.id("_storage") },
  handler: async (ctx, { organizationId, storageId }) => {
    await requireMember(ctx, organizationId);
    // O anexo precisa estar registrado PARA esta organização. Antes qualquer
    // membro de qualquer unidade podia pedir a URL de um storageId alheio.
    const file = await ctx.db
      .query("files")
      .withIndex("by_org_storage", (q) =>
        q.eq("organizationId", organizationId).eq("storageId", storageId),
      )
      .first();
    if (!file) bad("Arquivo não encontrado nesta unidade.");
    const cap = FILE_RECORD_CAPS[file.recordType];
    if (!cap) bad("Tipo de anexo não permitido.");
    await requireView(ctx, organizationId, cap);
    return await ctx.storage.getUrl(storageId);
  },
});

/* ------------------------------ demo ------------------------------ */

export const enterDemoMode = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    if (isCommercialGateRequired()) bad("Demonstração indisponível no ambiente comercial.");
    await enforceRateLimit(ctx, userId, "enterDemoMode");
    // Se já participa de uma organização demo, reusa.
    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId as Id<"users">))
      .collect();
    for (const m of memberships) {
      const org = await ctx.db.get(m.organizationId);
      if (org?.isDemo) return org._id;
    }
    const now = Date.now();
    const orgId = await ctx.db.insert("organizations", {
      name: "Barbearia Navalha de Ouro",
      ownerId: userId as Id<"users">,
      phone: "(11) 98765-4321",
      address: "Rua das Tesouras, 123 — Vila Madalena, São Paulo/SP",
      email: "contato@navalhadeouro.demo",
      businessHours: defaultBusinessHours(),
      settings: defaultSettings(),
      inviteCode: randomCode(),
      isDemo: true,
      salesCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("organizationMembers", {
      organizationId: orgId,
      userId: userId as Id<"users">,
      role: "owner",
      createdAt: now,
    });
    await ctx.runMutation(internal.orgs.seedDemo, { organizationId: orgId });
    return orgId;
  },
});

/** Executa a carga de dados demo (chamada internamente). */
export const seedDemo = internalMutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .first();
    await seedDemoData(ctx, organizationId, membership?.userId);
  },
});

export const resetDemoData = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const { userId } = await requireManage(ctx, organizationId, "demo");
    const org = await ctx.db.get(organizationId);
    if (!org?.isDemo) bad("Apenas organizações de demonstração podem ser redefinidas.");
    await wipeOrgData(ctx, organizationId);
    await ctx.runMutation(internal.orgs.seedDemo, { organizationId });
    await audit(ctx, organizationId, userId, {
      action: "redefiniu",
      module: "Dados demo",
      summary: "Dados de demonstração recriados",
    });
  },
});

export const clearDemoData = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const { userId } = await requireManage(ctx, organizationId, "demo");
    const org = await ctx.db.get(organizationId);
    if (!org?.isDemo) bad("Apenas organizações de demonstração podem ser limpas.");
    await wipeOrgData(ctx, organizationId);
    await ctx.db.patch(organizationId, { salesCount: 0, updatedAt: Date.now() });
    await audit(ctx, organizationId, userId, {
      action: "limpou",
      module: "Dados demo",
      summary: "Dados de demonstração removidos",
    });
  },
});

/* ------------------------------ wipe ------------------------------ */

export const ORG_TABLES = [
  "clients", "clientNotes", "barbers", "services", "packages", "clientPackages",
  "membershipPlans", "memberships", "appointments", "waitlist", "suppliers",
  "products", "inventoryMovements", "sales", "saleItems", "payments",
  "cashSessions", "cashMovements", "expenses", "commissions", "loyaltyAccounts",
  "loyaltyTransactions", "loyaltyRewards", "followups", "feedback",
  "notifications", "auditLogs", "files",
] as const;

export async function wipeOrgData(
  ctx: MutationCtx,
  organizationId: string,
): Promise<void> {
  type Queryable = {
    query(table: string): {
      withIndex(
        name: string,
        filter: (q: { eq: (field: string, value: string) => unknown }) => unknown,
      ): { collect(): Promise<Array<{ _id: string }>> };
    };
  };
  const db = ctx.db as unknown as Queryable;
  for (const table of ORG_TABLES) {
    const rows = await db
      .query(table)
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .collect();
    if (table === "files") {
      // Sem isso, apagar/limpar a unidade deixava os blobs órfãos no storage.
      for (const row of rows) {
        const storageId = (row as unknown as { storageId?: Id<"_storage"> }).storageId;
        if (storageId) await ctx.storage.delete(storageId);
      }
    }
    for (const row of rows) await ctx.db.delete(row._id as Id<"organizations">);
  }
}
