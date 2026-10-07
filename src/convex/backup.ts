import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { audit, requireManage } from "./lib";

/**
 * Exportação dos dados de uma unidade (backup e portabilidade — LGPD).
 *
 * Antes disso não existia nenhuma forma de tirar os dados da plataforma: nem
 * backup próprio, nem atendimento a pedido de portabilidade/exclusão. Aqui o
 * proprietário/administrador baixa um JSON com tudo que pertence à unidade.
 *
 * Regras:
 *  - exige permissão de "settings" (owner/admin);
 *  - lê somente a organização informada (todas as tabelas têm índice by_org);
 *  - limita as linhas por tabela para o arquivo não estourar o tamanho de
 *    retorno da função — o que for cortado vem sinalizado em `truncated`;
 *  - registra na auditoria quem exportou e quando (dado sensível saindo).
 */

const MAX_ROWS = 5_000;

/** Tabelas da unidade — todas expõem o índice `by_org`. */
type OrgTable =
  | "organizationMembers"
  | "clients"
  | "clientNotes"
  | "barbers"
  | "services"
  | "packages"
  | "clientPackages"
  | "membershipPlans"
  | "memberships"
  | "appointments"
  | "waitlist"
  | "suppliers"
  | "products"
  | "inventoryMovements"
  | "sales"
  | "saleItems"
  | "payments"
  | "cashSessions"
  | "cashMovements"
  | "expenses"
  | "commissions"
  | "loyaltyAccounts"
  | "loyaltyTransactions"
  | "loyaltyRewards"
  | "followups"
  | "feedback"
  | "notifications"
  | "auditLogs"
  | "files";

export const exportOrganizationData = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { org, userId } = await requireManage(ctx, args.organizationId, "settings");
    const orgId = org._id;

    const byOrg = (table: OrgTable) =>
      ctx.db
        .query(table)
        .withIndex("by_org", (q) => q.eq("organizationId", orgId))
        .take(MAX_ROWS + 1);

    const raw = {
      organizationMembers: await byOrg("organizationMembers"),
      clients: await byOrg("clients"),
      clientNotes: await byOrg("clientNotes"),
      barbers: await byOrg("barbers"),
      services: await byOrg("services"),
      packages: await byOrg("packages"),
      clientPackages: await byOrg("clientPackages"),
      membershipPlans: await byOrg("membershipPlans"),
      memberships: await byOrg("memberships"),
      appointments: await byOrg("appointments"),
      waitlist: await byOrg("waitlist"),
      suppliers: await byOrg("suppliers"),
      products: await byOrg("products"),
      inventoryMovements: await byOrg("inventoryMovements"),
      sales: await byOrg("sales"),
      saleItems: await byOrg("saleItems"),
      payments: await byOrg("payments"),
      cashSessions: await byOrg("cashSessions"),
      cashMovements: await byOrg("cashMovements"),
      expenses: await byOrg("expenses"),
      commissions: await byOrg("commissions"),
      loyaltyAccounts: await byOrg("loyaltyAccounts"),
      loyaltyTransactions: await byOrg("loyaltyTransactions"),
      loyaltyRewards: await byOrg("loyaltyRewards"),
      followups: await byOrg("followups"),
      feedback: await byOrg("feedback"),
      notifications: await byOrg("notifications"),
      auditLogs: await byOrg("auditLogs"),
      files: await byOrg("files"),
    };

    const data: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};
    const truncated: string[] = [];
    for (const [table, rows] of Object.entries(raw)) {
      if (rows.length > MAX_ROWS) truncated.push(table);
      const kept = rows.length > MAX_ROWS ? rows.slice(0, MAX_ROWS) : rows;
      data[table] = kept;
      counts[table] = kept.length;
    }

    // Usuários são globais (não têm organizationId); exportamos só os que
    // aparecem como membros desta unidade, sem credenciais.
    const memberRows = raw.organizationMembers as Array<{ userId: Id<"users"> }>;
    const userIds = [...new Set(memberRows.map((m) => m.userId as string))].slice(0, 100);
    const users = [];
    for (const id of userIds) {
      const user = await ctx.db.get(id as Id<"users">);
      if (user) users.push({ _id: user._id, name: user.name, email: user.email });
    }

    await audit(ctx, orgId, userId, {
      action: "exportou",
      module: "Configurações",
      recordType: "organizations",
      recordId: orgId,
      summary: `Exportação de dados gerada (${Object.values(counts).reduce((s, n) => s + n, 0)} registros)`,
    });

    return {
      generatedAt: Date.now(),
      organization: org,
      users,
      counts,
      truncated,
      totalRows: Object.values(counts).reduce((s, n) => s + n, 0),
      data,
    };
  },
});
