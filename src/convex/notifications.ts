import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { audit, bad, requireView } from "./lib";

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    status: v.optional(v.union(v.literal("nao_lida"), v.literal("lida"), v.literal("resolvida"), v.literal("descartada"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireView(ctx, args.organizationId, "dashboard");
    const now = Date.now();
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_org_status", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const filtered = rows
      .filter((n) => (args.status ? n.status === args.status : n.status !== "descartada"))
      .filter((n) => !n.snoozedUntil || n.snoozedUntil <= now)
      .sort((a, b) => {
        const sev = { critico: 0, alerta: 1, info: 2 } as Record<string, number>;
        const s = (sev[a.severity] ?? 3) - (sev[b.severity] ?? 3);
        if (s !== 0) return s;
        return b.createdAt - a.createdAt;
      })
      .slice(0, args.limit ?? 40);

    const unread = rows.filter((n) => n.status === "nao_lida" && (!n.snoozedUntil || n.snoozedUntil <= now)).length;
    void userId;
    return { notifications: filtered, unread };
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    notificationId: v.id("notifications"),
    action: v.union(v.literal("ler"), v.literal("resolver"), v.literal("descartar"), v.literal("snooze")),
    snoozeMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireView(ctx, args.organizationId, "dashboard");
    const n = await ctx.db.get(args.notificationId);
    if (!n || n.organizationId !== args.organizationId) bad("Notificação não encontrada.");
    if (args.action === "ler") await ctx.db.patch(n._id, { status: "lida" });
    if (args.action === "resolver") await ctx.db.patch(n._id, { status: "resolvida" });
    if (args.action === "descartar") await ctx.db.patch(n._id, { status: "descartada" });
    if (args.action === "snooze") {
      const minutes = args.snoozeMinutes ?? 120;
      await ctx.db.patch(n._id, {
        snoozedUntil: Date.now() + minutes * 60_000,
        status: "lida",
      });
    }
  },
});

export const markAllRead = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { userId } = await requireView(ctx, args.organizationId, "dashboard");
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_org_status", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    let count = 0;
    for (const n of rows) {
      if (n.status === "nao_lida") {
        await ctx.db.patch(n._id, { status: "lida" });
        count++;
      }
    }
    if (count > 0) {
      await audit(ctx, args.organizationId, userId, {
        action: "marcou",
        module: "Alertas",
        summary: `${count} alerta(s) marcados como lidos`,
      });
    }
    return count;
  },
});

export const listAudit = query({
  args: {
    organizationId: v.id("organizations"),
    module: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireView(ctx, args.organizationId, "audit");
    const rows = await ctx.db
      .query("auditLogs")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return rows
      .filter((a) => (args.module ? a.module === args.module : true))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, args.limit ?? 120);
  },
});