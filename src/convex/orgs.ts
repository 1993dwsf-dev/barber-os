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
} from "./lib";
import { APP_ROLES, type AppRole } from "../lib/rbac";

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

function randomCode(len = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
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
      if (org) out.push({ org, role: m.role, memberId: m._id });
    }
    return out;
  },
});

export const getOrgContext = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const { member, org } = await requireMember(ctx, organizationId);
    return { org, member };
  },
});

export const listMembers = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMember(ctx, organizationId);
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
        name: user?.name ?? "(sem nome)",
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
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    if (!args.name.trim()) bad("Informe o nome da barbearia.");
    const orgId = await ctx.db.insert("organizations", {
      name: args.name.trim(),
      ownerId: userId as Id<"users">,
      phone: args.phone,
      address: args.address,
      email: args.email,
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
    await audit(ctx, orgId, userId, {
      action: "criou",
      module: "Organização",
      recordType: "organizations",
      recordId: orgId,
      summary: `Organização "${args.name}" criada`,
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
    for (const [k, val] of Object.entries(rest)) if (val !== undefined) patch[k] = val;
    if (businessHours) patch.businessHours = businessHours;
    if (settings) patch.settings = { ...org.settings, ...settings };
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
    const { userId } = await requireMember(ctx, organizationId);
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
    await ctx.db.delete(memberId);
    await audit(ctx, organizationId, me.userId, {
      action: "removeu",
      module: "Equipe",
      summary: `Membro removido (${target.role})`,
    });
  },
});

export const regenerateInviteCode = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const { userId } = await requireManage(ctx, organizationId, "settings");
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
  handler: async (ctx, { code }) => {
    const userId = await requireUserId(ctx);
    const normalized = code.trim().toUpperCase();
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_invite", (q) => q.eq("inviteCode", normalized))
      .first();
    if (!org) bad("Código de convite inválido.");
    const existing = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId as Id<"users">),
      )
      .first();
    if (existing) return org._id;
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
    return org._id;
  },
});

/* ------------------------------ arquivos ------------------------------ */

export const generateUploadUrl = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMember(ctx, organizationId);
    return await ctx.storage.generateUploadUrl();
  },
});

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
    const { userId } = await requireMember(ctx, args.organizationId);
    return await ctx.db.insert("files", {
      organizationId: args.organizationId,
      storageId: args.storageId,
      recordType: args.recordType,
      recordId: args.recordId,
      name: args.name,
      mimeType: args.mimeType,
      size: args.size,
      uploadedBy: userId as Id<"users">,
      createdAt: Date.now(),
    });
  },
});

export const getFileUrl = query({
  args: { organizationId: v.id("organizations"), storageId: v.id("_storage") },
  handler: async (ctx, { organizationId, storageId }) => {
    await requireMember(ctx, organizationId);
    return await ctx.storage.getUrl(storageId);
  },
});

/* ------------------------------ demo ------------------------------ */

export const enterDemoMode = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
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
    const { seedDemoData } = await import("./seed");
    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .collect();
    await seedDemoData(ctx, organizationId, memberships[0]?.userId);
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
    for (const row of rows) await ctx.db.delete(row._id as Id<"organizations">);
  }
}
