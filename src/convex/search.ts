import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireView } from "./lib";
import { todayISO } from "../lib/dates";

export const globalSearch = query({
  args: {
    organizationId: v.id("organizations"),
    q: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireView(ctx, args.organizationId, "dashboard");
    const term = args.q.trim();
    if (term.length < 2) return [];
    const limit = args.limit ?? 6;
    const today = todayISO();
    const digits = term.replace(/\D/g, "");
    const results: Array<{ type: string; title: string; subtitle: string; link: string }> = [];

    const clients = await ctx.db
      .query("clients")
      .withSearchIndex("search_name", (q) =>
        q.search("name", term).eq("organizationId", args.organizationId),
      )
      .take(limit);
    for (const c of clients) {
      results.push({
        type: "Cliente",
        title: c.name,
        subtitle: c.phone,
        link: `/app/clientes/${c._id}`,
      });
    }
    if (digits.length >= 4) {
      const byPhone = await ctx.db
        .query("clients")
        .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
        .collect();
      for (const c of byPhone) {
        if (results.some((r) => r.link === `/app/clientes/${c._id}`)) continue;
        if (c.phone.replace(/\D/g, "").includes(digits))
          results.push({ type: "Cliente", title: c.name, subtitle: c.phone, link: `/app/clientes/${c._id}` });
        if (results.length >= limit * 2) break;
      }
    }

    const barbers = await ctx.db
      .query("barbers")
      .withSearchIndex("search_name", (q) =>
        q.search("name", term).eq("organizationId", args.organizationId),
      )
      .take(limit);
    for (const b of barbers) {
      results.push({ type: "Barbeiro", title: b.name, subtitle: b.jobTitle ?? "", link: `/app/barbeiros/${b._id}` });
    }

    const services = await ctx.db
      .query("services")
      .withSearchIndex("search_name", (q) =>
        q.search("name", term).eq("organizationId", args.organizationId),
      )
      .take(limit);
    for (const s of services) {
      results.push({ type: "Serviço", title: s.name, subtitle: s.category, link: "/app/servicos" });
    }

    const products = await ctx.db
      .query("products")
      .withSearchIndex("search_name", (q) =>
        q.search("name", term).eq("organizationId", args.organizationId),
      )
      .take(limit);
    for (const p of products) {
      results.push({
        type: "Produto",
        title: p.name,
        subtitle: `${p.stock} ${p.unit} em estoque`,
        link: "/app/produtos",
      });
    }

    const todayAppointments = await ctx.db
      .query("appointments")
      .withIndex("by_org_date", (q) => q.eq("organizationId", args.organizationId).eq("date", today))
      .collect();
    for (const a of todayAppointments.slice(0, 40)) {
      const client = await ctx.db.get(a.clientId);
      const service = await ctx.db.get(a.serviceId);
      if (!client) continue;
      if (
        client.name.toLowerCase().includes(term.toLowerCase()) ||
        (service?.name ?? "").toLowerCase().includes(term.toLowerCase())
      ) {
        results.push({
          type: "Agendamento",
          title: `${a.startTime} — ${client.name}`,
          subtitle: service?.name ?? "",
          link: "/app/agenda",
        });
      }
    }

    return results.slice(0, 24);
  },
});