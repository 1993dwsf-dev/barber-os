/*
 * Suíte de backend do Barber OS.
 *
 * Chama as funções REAIS do Convex (os mesmos handlers do deployment) sobre o
 * backend em memória do `convex-test`, com identidade autenticada compatível
 * com `getAuthUserId` do @convex-dev/auth: o claim `subject` precisa do
 * formato `userId|sessionId`.
 *
 * Executar: bun run test:backend  (runner do vitest).
 */
import { convexTest } from "convex-test";
import { beforeEach, expect, test } from "vitest";
import { api } from "../src/convex/_generated/api";
import type { Id } from "../src/convex/_generated/dataModel";
import schema from "../src/convex/schema";

// convex-test espera os módulos globados a partir da raiz do projeto.
const modules = import.meta.glob("../src/convex/**/*.ts");

let t: ReturnType<typeof convexTest<typeof schema>>;

beforeEach(() => {
  t = convexTest(schema, modules);
});

/* ------------------------------ helpers ------------------------------ */

type Owner = {
  userId: Id<"users">;
  sessionId: Id<"authSessions">;
  t2: ReturnType<typeof t.withIdentity>;
  orgId: Id<"organizations">;
};


/** Cria owner com e-mail verificado (conta recuperável) + organização. */
async function seedOwner(): Promise<Owner> {
  const { userId, sessionId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Dona Proprietária",
      email: "owner@barbearia.test",
      emailVerificationTime: Date.now(),
    });
    const sessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 60 * 60 * 1000,
    });
    return { userId, sessionId };
  });

  const issuer = "https://test.convex.site";
  const subject = `${userId}|${sessionId}`;
  const t2 = t.withIdentity({
    issuer,
    subject,
    tokenIdentifier: `${issuer}|${subject}`,
    emailVerified: true,
  });

  const orgId = await t2.mutation(api.orgs.createOrganization, {
    name: "Barbearia Teste",
  });

  return { userId, sessionId, t2, orgId };
}

/** Segundo usuário (barbeiro) na mesma organização. */
async function seedStaff(owner: Owner, role: "barber" | "cashier" | "viewer") {
  const { userId, sessionId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: `Equipe ${role}`,
      email: `staff-${role}-${Math.random()}@barbearia.test`,
      emailVerificationTime: Date.now(),
    });
    const sessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 60 * 60 * 1000,
    });
    return { userId, sessionId };
  });
  const issuer = "https://test.convex.site";
  const subject = `${userId}|${sessionId}`;
  const t2 = t.withIdentity({
    issuer,
    subject,
    tokenIdentifier: `${issuer}|${subject}`,
    emailVerified: true,
  });
  await t2.mutation(api.orgs.joinByInviteCode, {
    code: await t.run((ctx) =>
      ctx.db.get(owner.orgId)!.then((o) => o!.inviteCode),
    ),
  });
  if (role !== "barber") {
    // joinByInviteCode entra como barber; promote via owner
    await t2.mutation(api.orgs.updateMemberRole, {
      organizationId: owner.orgId,
      memberId: await t.run(async (ctx) => {
        const m = await ctx.db
          .query("organizationMembers")
          .withIndex("by_org_user", (q) =>
            q.eq("organizationId", owner.orgId).eq("userId", userId),
          )
          .first();
        return m!._id;
      }),
      role,
    });
  }
  return { userId, sessionId, t2 };
}

async function seedCatalog(owner: Owner) {
  const serviceId = await owner.t2.mutation(api.services.create, {
    organizationId: owner.orgId,
    category: "Cabelo",
    name: "Corte classy",
    durationMin: 30,
    priceCents: 5000,
  });
  const barberId = await owner.t2.mutation(api.barbers.create, {
    organizationId: owner.orgId,
    name: "João Navalha",
    schedule: [
      { weekday: 0, enabled: true, start: "09:00", end: "18:00" },
      { weekday: 1, enabled: true, start: "09:00", end: "18:00" },
      { weekday: 2, enabled: true, start: "09:00", end: "18:00" },
      { weekday: 3, enabled: true, start: "09:00", end: "18:00" },
      { weekday: 4, enabled: true, start: "09:00", end: "18:00" },
      { weekday: 5, enabled: true, start: "09:00", end: "18:00" },
      { weekday: 6, enabled: true, start: "09:00", end: "18:00" },
    ],
  });
  const clientId = await owner.t2.mutation(api.clients.create, {
    organizationId: owner.orgId,
    name: "Maria Cliente",
    phone: "11999990000",
  });
  return { serviceId, barberId, clientId };
}


/* ------------------------------ conta / organização ------------------------------ */

test("createOrganization exige conta recuperável com e-mail verificado", async () => {
  const { userId, sessionId } = await t.run(async (ctx) => {
    // conta anônima (provider guest)
    const userId = await ctx.db.insert("users", { isAnonymous: true });
    const sessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 60 * 60 * 1000,
    });
    return { userId, sessionId };
  });
  const issuer = "https://test.convex.site";
  const subject = `${userId}|${sessionId}`;
  const t2 = t.withIdentity({
    issuer,
    subject,
    tokenIdentifier: `${issuer}|${subject}`,
  });

  await expect(
    t2.mutation(api.orgs.createOrganization, { name: "X" }),
  ).rejects.toThrow(/conta recuperável|confirme seu e-mail/i);
});

/* ------------------------------ RBAC nas funções reais ------------------------------ */

test("viewer não consegue gravar em POS (canManage negado na função real)", async () => {
  const owner = await seedOwner();
  const { serviceId } = await seedCatalog(owner);
  const staff = await seedStaff(owner, "viewer");

  await staff.t2.run(async (ctx) => {
    const m = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", owner.orgId).eq("userId", staff.userId),
      )
      .first();
    await ctx.db.patch(m!._id, { role: "viewer" });
  });

  await expect(
    staff.t2.mutation(api.sales.createSale, {
      organizationId: owner.orgId,
      items: [{ kind: "servico", refId: serviceId, qty: 1 }],
      payments: [{ method: "pix", amountCents: 5000 }],
    }),
  ).rejects.toThrow(/sem permissão/i);
});

/* ------------------------------ vendas / PDV ------------------------------ */

test("venda fechando o total é gravada com itens, pagamentos e estatísticas do cliente", async () => {
  const owner = await seedOwner();
  const { serviceId, barberId, clientId } = await seedCatalog(owner);

  const result = await owner.t2.mutation(api.sales.createSale, {
    organizationId: owner.orgId,
    clientId,
    barberId,
    items: [{ kind: "servico", refId: serviceId, qty: 1, barberId }],
    payments: [{ method: "pix", amountCents: 5000 }],
  });
  expect(result.totalCents).toBe(5000);
  expect(result.moneyCents).toBe(5000);

  const sale = await t.run((ctx) => ctx.db.get(result.saleId));
  expect(sale!.status).toBe("concluida");
  expect(sale!.number).toBe(1);

  const client = await t.run((ctx) => ctx.db.get(clientId));
  expect(client!.totalVisits).toBe(1);
  expect(client!.totalSpentCents).toBe(5000);
});

test("venda com quantidade fracionária é rejeitada na mutação real", async () => {
  const owner = await seedOwner();
  const { serviceId } = await seedCatalog(owner);

  await expect(
    owner.t2.mutation(api.sales.createSale, {
      organizationId: owner.orgId,
      items: [{ kind: "servico", refId: serviceId, qty: 1.5 }],
      payments: [{ method: "pix", amountCents: 5000 }],
    }),
  ).rejects.toThrow(/quantidade/i);
});

test("venda com pagamento zero é rejeitada na mutação real", async () => {
  const owner = await seedOwner();
  const { serviceId } = await seedCatalog(owner);

  await expect(
    owner.t2.mutation(api.sales.createSale, {
      organizationId: owner.orgId,
      items: [{ kind: "servico", refId: serviceId, qty: 1 }],
      payments: [{ method: "pix", amountCents: 0 }],
    }),
  ).rejects.toThrow(/pagamento/i);
});

test("venda com crédito de pacote e assinatura no mesmo item é rejeitada", async () => {
  const owner = await seedOwner();
  const cat = await seedCatalog(owner);

  // cria pacote + plano contendo o serviço e vende/assinatura para o cliente
  const packageId = await owner.t2.mutation(api.catalog.createPackage, {
    organizationId: owner.orgId,
    name: "Pacote Cortes",
    priceCents: 9000,
    validityDays: 30,
    items: [{ serviceId: cat.serviceId, sessions: 2 }],
  });
  const planId = await owner.t2.mutation(api.catalog.createPlan, {
    organizationId: owner.orgId,
    name: "Plano Clássico",
    priceCents: 19900,
    items: [{ serviceId: cat.serviceId, credits: 4 }],
  });

  await owner.t2.mutation(api.cash.openSession, {
    organizationId: owner.orgId,
    openingBalanceCents: 0,
  });

  await owner.t2.mutation(api.catalog.buyPackage, {
    organizationId: owner.orgId,
    clientId: cat.clientId,
    packageId,
    payments: [{ method: "pix", amountCents: 9000 }],
  });
  await owner.t2.mutation(api.catalog.subscribe, {
    organizationId: owner.orgId,
    clientId: cat.clientId,
    planId,
    payments: [{ method: "pix", amountCents: 19900 }],
  });

  const clientPackages = await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("clientPackages")
      .withIndex("by_org", (q) => q.eq("organizationId", owner.orgId))
      .collect();
    return rows;
  });
  const memberships = await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("memberships")
      .withIndex("by_org", (q) => q.eq("organizationId", owner.orgId))
      .collect();
    return rows;
  });
  expect(clientPackages.length).toBe(1);
  expect(memberships.length).toBe(1);

  await expect(
    owner.t2.mutation(api.sales.createSale, {
      organizationId: owner.orgId,
      clientId: cat.clientId,
      items: [
        {
          kind: "servico",
          refId: cat.serviceId,
          qty: 1,
          barberId: cat.barberId,
          coveredByCreditCents: 5000,
          clientPackageId: clientPackages[0]._id,
          membershipId: memberships[0]._id,
        },
      ],
      payments: [],
    }),
  ).rejects.toThrow(/pacote e assinatura/i);
});
