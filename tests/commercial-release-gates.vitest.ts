/**
 * Gates comerciais reais em Convex descartável.
 * NÃO usa deployments remotos, credenciais ou dados de clientes.
 *
 * O objetivo é impedir regressões em convite vinculado a e-mail, isolamento
 * entre tenants, suspensão de escrita e portabilidade após vencimento.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "../src/convex/_generated/api";
import schema from "../src/convex/schema";

const modules = import.meta.glob("../src/convex/**/*.ts");
let t: ReturnType<typeof convexTest<typeof schema>>;

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("BARBER_AUTH_COMMERCIAL_ENABLED", "true");
  vi.stubEnv("BARBER_BILLING_ENFORCED", "true");
  t = convexTest(schema, modules);
});
afterEach(() => vi.unstubAllEnvs());

async function verified(email: string) {
  const { userId, sessionId } = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", {
      email, name: email.split("@")[0], emailVerificationTime: Date.now(),
    });
    const sessionId = await ctx.db.insert("authSessions", {
      userId, expirationTime: Date.now() + 3_600_000,
    });
    return { userId, sessionId };
  });
  const issuer = "https://test.convex.site";
  const subject = `${userId}|${sessionId}`;
  return t.withIdentity({
    issuer, subject, tokenIdentifier: `${issuer}|${subject}`, emailVerified: true,
  });
}

async function provision(email: string, name: string, days = 14) {
  const session = await verified(email);
  const invite = await t.mutation(internal.orgs.issuePilotInvite, { email, trialDays: days });
  const organizationId = await session.mutation(api.orgs.createOrganization, {
    name, pilotInviteCode: invite.code,
  });
  return { session, organizationId, invite };
}

test("cadastro comercial não aceita tenant sem convite e não consome convite de outra conta", async () => {
  const primary = await verified("dono-a@example.test");
  const second = await verified("dono-b@example.test");
  await expect(primary.mutation(api.orgs.createOrganization, { name: "Sem convite" }))
    .rejects.toThrow(/Convite comercial/i);

  const invite = await t.mutation(internal.orgs.issuePilotInvite, {
    email: "dono-a@example.test", trialDays: 14,
  });
  await expect(second.mutation(api.orgs.createOrganization, {
    name: "Conta errada", pilotInviteCode: invite.code,
  })).rejects.toThrow(/Convite comercial inválido/i);
  expect((await t.run(ctx => ctx.db.get(invite.inviteId)))?.redeemedAt).toBeUndefined();

  const orgId = await primary.mutation(api.orgs.createOrganization, {
    name: "Barbearia A", pilotInviteCode: invite.code,
  });
  expect(orgId).toBeTruthy();
  await expect(primary.mutation(api.orgs.createOrganization, {
    name: "Reutilização", pilotInviteCode: invite.code,
  })).rejects.toThrow(/Convite comercial inválido/i);
});

test("duas barbearias comerciais isolam clientes, agenda e exportação", async () => {
  const a = await provision("dono-a@example.test", "Barbearia A");
  const b = await provision("dono-b@example.test", "Barbearia B");
  const clientA = await a.session.mutation(api.clients.create, {
    organizationId: a.organizationId,
    name: "Cliente Fictício A", phone: "11987654321",
  });
  await b.session.mutation(api.clients.create, {
    organizationId: b.organizationId,
    name: "Cliente Fictício B", phone: "11999998888",
  });

  await expect(a.session.query(api.clients.list, {
    organizationId: b.organizationId,
  })).rejects.toThrow(/não tem acesso/i);
  await expect(b.session.query(api.orgs.getOrgContext, {
    organizationId: a.organizationId,
  })).rejects.toThrow(/não tem acesso/i);
  await expect(b.session.query(api.appointments.agenda, {
    organizationId: a.organizationId,
    date: "2026-11-02",
  })).rejects.toThrow(/não tem acesso/i);
  await expect(b.session.mutation(api.clients.remove, {
    organizationId: a.organizationId, clientId: clientA,
  })).rejects.toThrow(/não tem acesso/i);
  await expect(b.session.mutation(api.backup.exportOrganizationData, {
    organizationId: a.organizationId,
  })).rejects.toThrow(/não tem acesso/i);

  const exportedA = await a.session.mutation(api.backup.exportOrganizationData, {
    organizationId: a.organizationId,
  });
  expect(exportedA.organization._id).toBe(a.organizationId);
  expect(exportedA.data.clients).toHaveLength(1);
  expect((exportedA.data.clients[0] as { name: string }).name).toBe("Cliente Fictício A");
  expect(exportedA.truncated).toEqual([]);
});

test("piloto suspenso bloqueia mutações operacionais, mas mantém consulta e portabilidade", async () => {
  const { session, organizationId } = await provision("dono@example.test", "Barbearia Piloto");
  await session.mutation(api.clients.create, {
    organizationId, name: "Cliente Fictício", phone: "11987654321",
  });

  await t.run(async ctx => {
    const ent = await ctx.db.query("organizationEntitlements")
      .withIndex("by_org", q => q.eq("organizationId", organizationId)).unique();
    if (!ent) throw new Error("Teste inválido: entitlement não criado");
    await ctx.db.patch(ent._id, { status: "suspended", updatedAt: Date.now() });
  });

  const status = await session.query(api.orgs.commercialStatus, { organizationId });
  expect(status.enforced).toBe(true);
  expect(status.canWrite).toBe(false);
  expect(status.status).toBe("suspended");
  await expect(session.mutation(api.clients.create, {
    organizationId, name: "Tentativa bloqueada", phone: "11999998888",
  })).rejects.toThrow(/plano ausente|suspenso|indisponível/i);
  expect((await session.query(api.clients.list, { organizationId })).total).toBe(1);
  const backup = await session.mutation(api.backup.exportOrganizationData, {
    organizationId,
  });
  expect(backup.data.clients).toHaveLength(1);
});

test("trial expirado bloqueia escrita mesmo com a tela de cadastro visível", async () => {
  const { session, organizationId } = await provision("dono@example.test", "Trial Vencido");
  await t.run(async ctx => {
    const ent = await ctx.db.query("organizationEntitlements")
      .withIndex("by_org", q => q.eq("organizationId", organizationId)).unique();
    if (!ent) throw new Error("Teste inválido: entitlement não criado");
    await ctx.db.patch(ent._id, { trialEndsAt: Date.now() - 1_000, updatedAt: Date.now() });
  });
  const status = await session.query(api.orgs.commercialStatus, { organizationId });
  expect(status.status).toBe("trialing");
  expect(status.canWrite).toBe(false);
  await expect(session.mutation(api.clients.create, {
    organizationId, name: "Novo Cliente", phone: "11987654321",
  })).rejects.toThrow(/plano ausente|expirado|indisponível/i);
});
