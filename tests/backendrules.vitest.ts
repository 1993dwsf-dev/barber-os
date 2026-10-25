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
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "../src/convex/_generated/api";
import type { Id } from "../src/convex/_generated/dataModel";
import schema from "../src/convex/schema";
import { validateStoredFileMetadata } from "../src/convex/fileSecurity";

// convex-test espera os módulos globados a partir da raiz do projeto.
const modules = import.meta.glob("../src/convex/**/*.ts");

let t: ReturnType<typeof convexTest<typeof schema>>;

beforeEach(() => {
  t = convexTest(schema, modules);
});

afterEach(() => vi.unstubAllEnvs());

/* ------------------------------ helpers ------------------------------ */

type Owner = {
  userId: Id<"users">;
  sessionId: Id<"authSessions">;
  t2: ReturnType<typeof t.withIdentity>;
  orgId: Id<"organizations">;
};

/** Cria owner com e-mail verificado (conta recuperável) + organização. */
async function seedOwner(email = "owner@barbearia.test"): Promise<Owner> {
  const { userId, sessionId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Dona Proprietária",
      email,
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
    await owner.t2.mutation(api.orgs.updateMemberRole, {
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

test("limite de convites bloqueia tentativas incorretas e persiste os registros", async () => {
  const owner = await seedOwner();

  for (let attempt = 0; attempt < 10; attempt++) {
    const result = await owner.t2.mutation(api.orgs.joinByInviteCode, {
      code: `INVALIDO${attempt}`,
    });
    expect(result).toEqual({ ok: false, error: "Código de convite inválido." });
  }

  const attempts = await t.run((ctx) =>
    ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) =>
        q.eq("key", `joinByInviteCode:${owner.userId}`),
      )
      .collect(),
  );
  expect(attempts).toHaveLength(10);

  const blocked = await owner.t2.mutation(api.orgs.joinByInviteCode, {
    code: (await t.run((ctx) => ctx.db.get(owner.orgId)))!.inviteCode,
  });
  expect(blocked.ok).toBe(false);
  if (!blocked.ok) expect(blocked.error).toMatch(/muitas tentativas/i);
});

test("convite válido libera a janela de tentativas do usuário", async () => {
  const owner = await seedOwner();
  const invalid = await owner.t2.mutation(api.orgs.joinByInviteCode, { code: "ERRADO123" });
  expect(invalid.ok).toBe(false);

  const code = (await t.run((ctx) => ctx.db.get(owner.orgId)))!.inviteCode;
  const valid = await owner.t2.mutation(api.orgs.joinByInviteCode, { code });
  expect(valid).toEqual({ ok: true, organizationId: owner.orgId });

  const attempts = await t.run((ctx) =>
    ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) =>
        q.eq("key", `joinByInviteCode:${owner.userId}`),
      )
      .collect(),
  );
  expect(attempts).toHaveLength(0);
});

test("caixa rejeita valores fracionários em centavos na abertura, movimentos e fechamento", async () => {
  const owner = await seedOwner();
  await expect(
    owner.t2.mutation(api.cash.openSession, {
      organizationId: owner.orgId,
      openingBalanceCents: 100.5,
    }),
  ).rejects.toThrow(/centavos/i);

  await owner.t2.mutation(api.cash.openSession, {
    organizationId: owner.orgId,
    openingBalanceCents: 100,
  });

  await expect(
    owner.t2.mutation(api.cash.addMovement, {
      organizationId: owner.orgId,
      type: "entrada",
      amountCents: 1.5,
      description: "Valor inválido",
    }),
  ).rejects.toThrow(/centavos/i);

  await expect(
    owner.t2.mutation(api.cash.closeSession, {
      organizationId: owner.orgId,
      countedCents: 100.5,
    }),
  ).rejects.toThrow(/centavos/i);

  const session = await owner.t2.query(api.cash.currentSession, {
    organizationId: owner.orgId,
  });
  expect(session?.session.status).toBe("aberto");
  expect(session?.expectedCents).toBe(100);

  await owner.t2.mutation(api.cash.closeSession, {
    organizationId: owner.orgId,
    countedCents: 100,
  });
});

test("barbeiro não acessa o PDV geral; caixa mantém acesso normal", async () => {
  const owner = await seedOwner();
  const barber = await seedStaff(owner, "barber");
  const cashier = await seedStaff(owner, "cashier");
  await expect(barber.t2.query(api.sales.listSales, {
    organizationId: owner.orgId,
  })).rejects.toThrow(/sem permissão/i);
  expect(await cashier.t2.query(api.sales.listSales, {
    organizationId: owner.orgId,
  })).toBeDefined();
  expect(await cashier.t2.query(api.cash.currentSession, {
    organizationId: owner.orgId,
  })).toBeNull();
});

test("dois barbeiros com convite veem só os próprios atendimentos e comissões", async () => {
  const owner = await seedOwner("barber-privacy-owner@barbearia.test");
  const { serviceId, barberId, clientId } = await seedCatalog(owner);
  const secondBarberId = await owner.t2.mutation(api.barbers.create, {
    organizationId: owner.orgId, name: "Profissional Dois",
  });
  const first = await seedStaff(owner, "barber");
  const second = await seedStaff(owner, "barber");
  const day = new Date().toISOString().slice(0, 10);

  const ownAppointment = await owner.t2.mutation(api.appointments.create, {
    organizationId: owner.orgId, clientId, barberId, serviceId,
    date: day, startTime: "09:00", ignoreHours: true,
  });
  const secondAppointment = await owner.t2.mutation(api.appointments.create, {
    organizationId: owner.orgId, clientId, barberId: secondBarberId, serviceId,
    date: day, startTime: "10:00", ignoreHours: true,
  });
  for (const id of [barberId, secondBarberId]) {
    await owner.t2.mutation(api.sales.createSale, {
      organizationId: owner.orgId, clientId, barberId: id,
      items: [{ kind: "servico", refId: serviceId, barberId: id, qty: 1 }],
      payments: [{ method: "pix", amountCents: 5000 }],
    });
  }

  const noLink = await first.t2.query(api.barberPortal.myWorkspace, {
    organizationId: owner.orgId,
  });
  expect(noLink.linked).toBe(false);
  expect(noLink.appointments).toEqual([]);
  expect(noLink.commissions).toEqual([]);

  await t.run(async ctx => {
    for (const [user, profileId] of [[first.userId, barberId], [second.userId, secondBarberId]] as const) {
      const member = await ctx.db.query("organizationMembers")
        .withIndex("by_org_user", q =>
          q.eq("organizationId", owner.orgId).eq("userId", user),
        ).unique();
      await ctx.db.patch(member!._id, { barberId: profileId });
    }
  });
  const mine = await first.t2.query(api.barberPortal.myWorkspace, {
    organizationId: owner.orgId,
  });
  const theirs = await second.t2.query(api.barberPortal.myWorkspace, {
    organizationId: owner.orgId,
  });
  expect(mine.linked).toBe(true);
  expect(mine.appointments.map(a => a.id)).toEqual([ownAppointment]);
  expect(theirs.appointments.map(a => a.id)).toEqual([secondAppointment]);
  expect(mine.totals.totalCents).toBeGreaterThan(0);
  expect(theirs.totals.totalCents).toBeGreaterThan(0);

  await expect(first.t2.query(api.appointments.agenda, {
    organizationId: owner.orgId, from: day, to: day,
  })).rejects.toThrow(/sem permissão/i);
  await expect(first.t2.query(api.clients.list, {
    organizationId: owner.orgId,
  })).rejects.toThrow(/sem permissão/i);
  await expect(first.t2.query(api.commissions.list, {
    organizationId: owner.orgId,
  })).rejects.toThrow(/sem permissão/i);
  await expect(first.t2.query(api.barbers.performance, {
    organizationId: owner.orgId, from: day, to: day,
  })).rejects.toThrow(/sem permissão/i);
  await expect(first.t2.mutation(api.sales.createSale, {
    organizationId: owner.orgId,
    items: [{ kind: "servico", refId: serviceId, qty: 1 }],
    payments: [{ method: "pix", amountCents: 5000 }],
  })).rejects.toThrow(/sem permissão/i);
  await expect(first.t2.mutation(api.barberPortal.updateMyAppointment, {
    organizationId: owner.orgId, appointmentId: secondAppointment,
    status: "confirmado",
  })).rejects.toThrow(/não encontrado para seu perfil/i);

  await first.t2.mutation(api.barberPortal.updateMyAppointment, {
    organizationId: owner.orgId, appointmentId: ownAppointment, status: "confirmado",
  });
  await first.t2.mutation(api.barberPortal.updateMyAppointment, {
    organizationId: owner.orgId, appointmentId: ownAppointment, status: "em_atendimento",
  });
  await expect(first.t2.mutation(api.barberPortal.updateMyAppointment, {
    organizationId: owner.orgId, appointmentId: ownAppointment, status: "confirmado",
  })).rejects.toThrow(/não permitida/i);
  const visibleOrg = (await first.t2.query(api.orgs.myOrganizations, {}))[0].org;
  expect(visibleOrg.inviteCode).toBe("");
  expect(visibleOrg.phone).toBeUndefined();
  expect(visibleOrg.settings.productCategories).toEqual([]);
  await expect(owner.t2.query(api.barberPortal.myWorkspace, {
    organizationId: owner.orgId,
  })).rejects.toThrow(/exclusiva do perfil Barbeiro/i);
});

test("membro de outra barbearia não consegue ler nem alterar dados da primeira", async () => {
  const first = await seedOwner();
  const second = await seedOwner("other-owner@barbearia.test");
  const { clientId, serviceId } = await seedCatalog(first);

  await expect(second.t2.query(api.orgs.getOrgContext, {
    organizationId: first.orgId,
  })).rejects.toThrow(/não tem acesso/i);
  await expect(second.t2.query(api.orgs.listMembers, {
    organizationId: first.orgId,
  })).rejects.toThrow(/não tem acesso/i);
  await expect(second.t2.mutation(api.orgs.updateOrganization, {
    organizationId: first.orgId,
    name: "Alteração indevida",
  })).rejects.toThrow(/não tem acesso/i);
  await expect(second.t2.query(api.clients.profile, {
    organizationId: first.orgId,
    clientId,
  })).rejects.toThrow(/não tem acesso/i);

  // Mesmo dentro de uma barbearia válida, IDs de outra não podem ser usados.
  await expect(second.t2.query(api.clients.profile, {
    organizationId: second.orgId,
    clientId,
  })).rejects.toThrow(/não encontrado/i);
  await expect(second.t2.mutation(api.sales.createSale, {
    organizationId: second.orgId,
    items: [{ kind: "servico", refId: serviceId, qty: 1 }],
    payments: [{ method: "pix", amountCents: 5000 }],
  })).rejects.toThrow(/não encontrado/i);
});

test("somente proprietário pode avançar onboarding; papéis sem equipe não listam membros", async () => {
  const owner = await seedOwner();
  const barber = await seedStaff(owner, "barber");
  const viewer = await seedStaff(owner, "viewer");

  await expect(barber.t2.query(api.orgs.listMembers, {
    organizationId: owner.orgId,
  })).rejects.toThrow(/sem permissão/i);
  await expect(barber.t2.mutation(api.orgs.setOnboardingStep, {
    organizationId: owner.orgId,
    step: 6,
  })).rejects.toThrow(/proprietário/i);
  await expect(viewer.t2.mutation(api.orgs.setOnboardingStep, {
    organizationId: owner.orgId,
  })).rejects.toThrow(/proprietário/i);
  await expect(owner.t2.mutation(api.orgs.setOnboardingStep, {
    organizationId: owner.orgId,
    step: 8,
  })).rejects.toThrow(/etapa/i);
  const before = await t.run((ctx) => ctx.db.get(owner.orgId));
  expect(before?.onboardingStep).toBe(1);
  await owner.t2.mutation(api.orgs.setOnboardingStep, {
    organizationId: owner.orgId,
    step: 2,
  });
  const after = await t.run((ctx) => ctx.db.get(owner.orgId));
  expect(after?.onboardingStep).toBe(2);
});

test("validação de metadados reais rejeita MIME, tamanho e registros inexistentes", () => {
  const stored = { size: 8, contentType: "image/png" };
  expect(validateStoredFileMetadata(stored, { size: 8, mimeType: "image/png" }))
    .toEqual({ size: 8, mimeType: "image/png" });
  expect(() => validateStoredFileMetadata(stored, { size: 999, mimeType: "image/png" }))
    .toThrow(/metadados/i);
  expect(() => validateStoredFileMetadata(stored, { size: 8, mimeType: "application/pdf" }))
    .toThrow(/metadados/i);
  expect(() => validateStoredFileMetadata({ size: 8, contentType: "text/html" }, {
    size: 8, mimeType: "text/html",
  })).toThrow(/formato/i);
  expect(() => validateStoredFileMetadata({ size: MAX_SAFE_SIZE, contentType: "image/png" }, {
    size: MAX_SAFE_SIZE, mimeType: "image/png",
  })).toThrow(/no máximo/i);
  expect(() => validateStoredFileMetadata(null, { size: 8, mimeType: "image/png" }))
    .toThrow(/não encontrado/i);
});
const MAX_SAFE_SIZE = 9 * 1024 * 1024;

test("uploads e URLs de anexos exigem autorização e isolamento da unidade", async () => {
  const owner = await seedOwner();
  const barber = await seedStaff(owner, "barber");
  const other = await seedOwner("storage-owner@barbearia.test");
  const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" });
  const storageId = await t.run((ctx) => ctx.storage.store(png));

  await expect(barber.t2.mutation(api.orgs.generateUploadUrl, {
    organizationId: owner.orgId,
  })).rejects.toThrow(/sem permissão/i);
  await expect(barber.t2.mutation(api.orgs.recordFile, {
    organizationId: owner.orgId, storageId, recordType: "expenses",
    name: "segredo.png", mimeType: "image/png", size: png.size,
  })).rejects.toThrow(/sem permissão/i);

  // O simulador de storage nesta versão não preserva MIME no system.get.
  // Registros existentes simulados verificam a política de leitura e
  // as proibições de reuso do ID (sem mudar o comportamento de produção).
  await t.run((ctx) => ctx.db.insert("files", {
    organizationId: owner.orgId,
    storageId,
    recordType: "expenses",
    name: "segredo.png",
    mimeType: "image/png",
    size: png.size,
    uploadedBy: owner.userId,
    createdAt: Date.now(),
  }));
  await expect(owner.t2.mutation(api.orgs.recordFile, {
    organizationId: owner.orgId, storageId, recordType: "expenses",
    name: "segredo.png", mimeType: "image/png", size: png.size,
  })).rejects.toThrow(/já foi registrado/i);
  await expect(other.t2.mutation(api.orgs.recordFile, {
    organizationId: other.orgId, storageId, recordType: "expenses",
    name: "segredo.png", mimeType: "image/png", size: png.size,
  })).rejects.toThrow(/outra unidade/i);
  await expect(barber.t2.query(api.orgs.getFileUrl, {
    organizationId: owner.orgId, storageId,
  })).rejects.toThrow(/sem permissão/i);
  await expect(other.t2.query(api.orgs.getFileUrl, {
    organizationId: other.orgId, storageId,
  })).rejects.toThrow(/arquivo não encontrado/i);
});

test("despesas rejeitam anexos com Content-Type não validado", async () => {
  const owner = await seedOwner();
  const pdf = new Blob([new Uint8Array([37, 80, 68, 70, 45])], { type: "application/pdf" });
  const storageId = await t.run((ctx) => ctx.storage.store(pdf));

  // Content-Type ausente no _storage do mock => sempre negar (fail closed).
  await expect(owner.t2.mutation(api.expenses.create, {
    organizationId: owner.orgId,
    description: "Despesa inválida", category: "Outros",
    amountCents: 500, method: "pix",
    fileStorageId: storageId, fileName: "comprovante.pdf",
    fileMimeType: "application/pdf", fileSize: pdf.size,
  })).rejects.toThrow(/formato real/i);
  const expenses = await t.run((ctx) =>
    ctx.db.query("expenses").withIndex("by_org_date", q => q.eq("organizationId", owner.orgId)).collect(),
  );
  expect(expenses).toHaveLength(0);
});


// ------------------------------ acesso comercial, convite e trial ------------------------------

/** Usuário autenticado verificado, ainda sem organização. */
async function makePilotUser(email: string) {
  const ids = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", {
      email, name: email, emailVerificationTime: Date.now(),
    });
    const sessionId = await ctx.db.insert("authSessions", {
      userId, expirationTime: Date.now() + 3600_000,
    });
    return { userId, sessionId };
  });
  const issuer = "https://test.convex.site";
  const subject = `${ids.userId}|${ids.sessionId}`;
  return t.withIdentity({
    issuer, subject,
    tokenIdentifier: `${issuer}|${subject}`,
    emailVerified: true,
  });
}

test("modo comercial é fail-closed: bloqueia criação sem convite mesmo sem a flag de billing", async () => {
  const user = await makePilotUser("pilot@barbearia.test");
  vi.stubEnv("BARBER_AUTH_COMMERCIAL_ENABLED", "true");
  vi.stubEnv("BARBER_BILLING_ENFORCED", "false");
  await expect(user.mutation(api.orgs.createOrganization, {
    name: "Sem convite",
  })).rejects.toThrow(/convite comercial/i);
  await expect(user.mutation(api.orgs.enterDemoMode, {}))
    .rejects.toThrow(/demonstração indisponível/i);
});

test("convite de piloto é único, vinculado ao e-mail e cria trial isolado", async () => {
  const holder = await makePilotUser("primeiro@barbearia.test");
  const attacker = await makePilotUser("segundo@barbearia.test");
  const { code } = await t.mutation(internal.orgs.issuePilotInvite, {
    email: "Primeiro@Barbearia.Test", trialDays: 2,
  });
  expect(code).toMatch(/^[0-9a-f]{64}$/);
  vi.stubEnv("BARBER_BILLING_ENFORCED", "true");
  await expect(attacker.mutation(api.orgs.createOrganization, {
    name: "Outra", pilotInviteCode: code,
  })).rejects.toThrow(/convite comercial inválido/i);
  const orgId = await holder.mutation(api.orgs.createOrganization, {
    name: "Barbearia Piloto", pilotInviteCode: code,
  });
  const status = await holder.query(api.orgs.commercialStatus, { organizationId: orgId });
  expect(status.enforced).toBe(true);
  expect(status.plan).toBe("pilot");
  expect(status.status).toBe("trialing");
  expect(status.canWrite).toBe(true);
  const second = await makePilotUser("primeiro@barbearia.test");
  await expect(second.mutation(api.orgs.createOrganization, {
    name: "Duplicação", pilotInviteCode: code,
  })).rejects.toThrow(/convite comercial inválido/i);
  const own = await t.run(ctx => ctx.db.get(orgId));
  expect(own?.name).toBe("Barbearia Piloto");
});

test("trial expirado bloqueia escrita no Convex, mas permite exportação autorizada", async () => {
  const holder = await makePilotUser("vencido@barbearia.test");
  const { code } = await t.mutation(internal.orgs.issuePilotInvite, {
    email: "vencido@barbearia.test", trialDays: 1,
  });
  vi.stubEnv("BARBER_BILLING_ENFORCED", "true");
  const orgId = await holder.mutation(api.orgs.createOrganization, {
    name: "Piloto Expirado", pilotInviteCode: code,
  });
  await holder.mutation(api.orgs.updateOrganization, {
    organizationId: orgId, name: "Antes do prazo",
  });
  await t.run(async ctx => {
    const e = await ctx.db.query("organizationEntitlements")
      .withIndex("by_org", q => q.eq("organizationId", orgId)).unique();
    await ctx.db.patch(e!._id, { trialEndsAt: Date.now() - 1 });
  });
  const status = await holder.query(api.orgs.commercialStatus, { organizationId: orgId });
  expect(status.canWrite).toBe(false);
  await expect(holder.mutation(api.orgs.updateOrganization, {
    organizationId: orgId, name: "Depois do prazo",
  })).rejects.toThrow(/plano ausente, expirado ou suspenso/i);
  await expect(holder.mutation(api.orgs.setOnboardingStep, {
    organizationId: orgId, step: 4,
  })).rejects.toThrow(/plano ausente, expirado ou suspenso/i);
  const exported = await holder.mutation(api.backup.exportOrganizationData, {
    organizationId: orgId,
  });
  expect(exported.organization._id).toBe(orgId);
  expect(exported.organization.name).toBe("Antes do prazo");
});

test("usuário de outra barbearia não consegue consultar o plano alheio", async () => {
  const ownerA = await seedOwner("entitle-a@barbearia.test");
  const ownerB = await seedOwner("entitle-b@barbearia.test");
  await expect(ownerB.t2.query(api.orgs.commercialStatus, {
    organizationId: ownerA.orgId,
  })).rejects.toThrow(/não tem acesso/i);
});


/* ----------------------- Cobrança única do agendamento ----------------------- */

test("PDV conclui atendimento somente uma vez e bloqueia nova cobrança vinculada", async () => {
  const owner = await seedOwner("checkout-owner@barbearia.test");
  const { clientId, barberId, serviceId } = await seedCatalog(owner);
  const appointmentId = await owner.t2.mutation(api.appointments.create, {
    organizationId: owner.orgId, clientId, barberId, serviceId,
    date: new Date().toISOString().slice(0, 10), startTime: "10:00",
    priceCents: 4500, ignoreHours: true,
  });
  const sale = () => owner.t2.mutation(api.sales.createSale, {
    organizationId: owner.orgId, appointmentId, clientId, barberId,
    items: [{
      kind: "servico" as const, refId: serviceId, qty: 1,
      barberId, unitPriceCents: 4500,
    }],
    payments: [{ method: "pix" as const, amountCents: 4500 }],
  });
  const result = await sale();
  const appt = await t.run(ctx => ctx.db.get(appointmentId));
  expect(appt?.status).toBe("concluido");
  expect(appt?.paymentStatus).toBe("pago");
  expect(appt?.saleId).toBe(result.saleId);
  await expect(sale()).rejects.toThrow(/já foi pago|já possui uma venda/i);
  const [sales, commissions, payments] = await t.run(async ctx => Promise.all([
    ctx.db.query("sales").withIndex("by_org", q => q.eq("organizationId", owner.orgId)).collect(),
    ctx.db.query("commissions").withIndex("by_org", q => q.eq("organizationId", owner.orgId)).collect(),
    ctx.db.query("payments").withIndex("by_org", q => q.eq("organizationId", owner.orgId)).collect(),
  ]));
  expect(sales).toHaveLength(1);
  expect(commissions).toHaveLength(1);
  expect(payments).toHaveLength(1);
  const client = await t.run(ctx => ctx.db.get(clientId));
  expect(client?.totalSpentCents).toBe(4500);
  expect(client?.totalVisits).toBe(1);
});

test("Agenda não cria mais venda e PDV recusa desvio de cliente, serviço e preço", async () => {
  const owner = await seedOwner("checkout-validation@barbearia.test");
  const { clientId, barberId, serviceId } = await seedCatalog(owner);
  const appointmentId = await owner.t2.mutation(api.appointments.create, {
    organizationId: owner.orgId, clientId, barberId, serviceId,
    date: new Date().toISOString().slice(0, 10), startTime: "11:00", ignoreHours: true,
  });
  await expect(owner.t2.mutation(api.appointments.complete, {
    organizationId: owner.orgId, appointmentId,
    payments: [{ method: "pix", amountCents: 5000 }],
  })).rejects.toThrow(/exclusiva pelo PDV/i);
  const baseSale = {
    organizationId: owner.orgId, appointmentId, clientId, barberId,
    items: [{ kind: "servico" as const, refId: serviceId, qty: 1, unitPriceCents: 5000, barberId }],
    payments: [{ method: "pix" as const, amountCents: 5000 }],
  };
  await expect(owner.t2.mutation(api.sales.createSale, {
    ...baseSale, clientId: undefined,
  })).rejects.toThrow(/não confere/i);
  await expect(owner.t2.mutation(api.sales.createSale, {
    ...baseSale, items: [{ ...baseSale.items[0], qty: 2 }],
  })).rejects.toThrow(/uma única vez/i);
  await expect(owner.t2.mutation(api.sales.createSale, {
    ...baseSale, items: [{ ...baseSale.items[0], unitPriceCents: 3000 }],
  })).rejects.toThrow(/preço combinados/i);
  const linked = await owner.t2.query(api.appointments.checkoutDetail, {
    organizationId: owner.orgId, appointmentId,
  });
  expect(linked.appointment._id).toBe(appointmentId);
  const other = await seedOwner("different-checkout-owner@barbearia.test");
  await expect(other.t2.query(api.appointments.checkoutDetail, {
    organizationId: other.orgId, appointmentId,
  })).rejects.toThrow(/não encontrado/i);
});


/* ----------------------- Categorias personalizadas de produtos ----------------------- */

test("categoria personalizada é salva, aparece no catálogo e funciona no PDV", async () => {
  const owner = await seedOwner("category-owner@barbearia.test");
  const category = await owner.t2.mutation(api.products.createCategory, {
    organizationId: owner.orgId, name: "  Bonés  ",
  });
  expect(category).toBe("Bonés");
  const org = await t.run(ctx => ctx.db.get(owner.orgId));
  expect(org?.settings.productCategories).toContain("Bonés");

  const productId = await owner.t2.mutation(api.products.create, {
    organizationId: owner.orgId,
    name: "Boné preto",
    category,
    costCents: 2500,
    priceCents: 5000,
    stock: 4,
    minStock: 1,
  });
  const sale = await owner.t2.mutation(api.sales.createSale, {
    organizationId: owner.orgId,
    items: [{ kind: "produto", refId: productId, qty: 1 }],
    payments: [{ method: "pix", amountCents: 5000 }],
  });
  expect(sale.totalCents).toBe(5000);
  const product = await t.run(ctx => ctx.db.get(productId));
  expect(product?.category).toBe("Bonés");
  expect(product?.stock).toBe(3);
});

test("categorias pertencem somente à barbearia e rejeitam nomes repetidos", async () => {
  const a = await seedOwner("categories-a@barbearia.test");
  const b = await seedOwner("categories-b@barbearia.test");
  await a.t2.mutation(api.products.createCategory, {
    organizationId: a.orgId, name: "Bebidas",
  });
  await expect(a.t2.mutation(api.products.createCategory, {
    organizationId: a.orgId, name: "  bebidas  ",
  })).rejects.toThrow(/já está cadastrada/i);
  await expect(b.t2.mutation(api.products.createCategory, {
    organizationId: a.orgId, name: "Roupas",
  })).rejects.toThrow(/não tem acesso/i);
  await b.t2.mutation(api.products.createCategory, {
    organizationId: b.orgId, name: "Bebidas",
  });
  const [orgA, orgB] = await t.run(ctx => Promise.all([
    ctx.db.get(a.orgId), ctx.db.get(b.orgId),
  ]));
  expect(orgA?.settings.productCategories).toContain("Bebidas");
  expect(orgB?.settings.productCategories).toContain("Bebidas");
  expect(orgB?.settings.productCategories).not.toContain("Roupas");
});

test("perfil sem gestão de produtos não cadastra categorias", async () => {
  const owner = await seedOwner("categories-permissions@barbearia.test");
  const viewer = await seedStaff(owner, "viewer");
  await expect(viewer.t2.mutation(api.products.createCategory, {
    organizationId: owner.orgId, name: "Bebidas",
  })).rejects.toThrow(/sem permissão/i);
  await expect(owner.t2.mutation(api.products.createCategory, {
    organizationId: owner.orgId, name: " ",
  })).rejects.toThrow(/entre 2 e 60 caracteres/i);
});
