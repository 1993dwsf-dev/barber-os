/**
 * Validação funcional multiusuário em Convex descartável (NUNCA em staging real).
 * Cria proprietários, dois funcionários e duas organizações com identidades
 * separadas, sem enviar e-mails nem tocar em dados remotos.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../src/convex/_generated/api";
import schema from "../src/convex/schema";

const modules = import.meta.glob("../src/convex/**/*.ts");
let t: ReturnType<typeof convexTest<typeof schema>>;
beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("BARBER_AUTH_COMMERCIAL_ENABLED", "false");
  vi.stubEnv("BARBER_BILLING_ENFORCED", "false");
  t = convexTest(schema, modules);
});
afterEach(() => vi.unstubAllEnvs());

async function account(email: string) {
  const { userId, sessionId } = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", {
      name: email.split("@")[0], email, emailVerificationTime: Date.now(),
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

describe("validação multiusuário em ambiente descartável", () => {
  test("dois funcionários entram pelo convite e recebem contas distintas sem virarem proprietários", async () => {
    const owner = await account("proprietario@example.test");
    const b1 = await account("barbeiro1@example.test");
    const b2 = await account("barbeiro2@example.test");
    const orgId = await owner.mutation(api.orgs.createOrganization, { name: "Barbearia Fictícia" });
    const org = await t.run(ctx => ctx.db.get(orgId));
    expect(org?.inviteCode).toMatch(/^[A-Z0-9]{4,12}$/);

    expect(await b1.mutation(api.orgs.joinByInviteCode, { code: org!.inviteCode }))
      .toEqual({ ok: true, organizationId: orgId });
    expect(await b2.mutation(api.orgs.joinByInviteCode, { code: org!.inviteCode }))
      .toEqual({ ok: true, organizationId: orgId });
    const members = await owner.query(api.orgs.listMembers, { organizationId: orgId });
    expect(members).toHaveLength(3);
    expect(members.map(m => m.role).sort()).toEqual(["barber", "barber", "owner"]);
    expect(new Set(members.map(m => m.userId)).size).toBe(3);

    // Reusar o convite não duplica o vínculo do mesmo funcionário.
    expect((await b1.mutation(api.orgs.joinByInviteCode, { code: org!.inviteCode })).ok).toBe(true);
    expect(await owner.query(api.orgs.listMembers, { organizationId: orgId })).toHaveLength(3);
    // O código interno do convite não é enviado ao portal do barbeiro.
    const info = await b1.query(api.orgs.getOrgContext, { organizationId: orgId });
    expect(info.member.role).toBe("barber");
    expect(info.org.inviteCode).toBe("");
  });

  test("permissões de barbeiro impedem acesso a clientes, caixa e administração", async () => {
    const owner = await account("proprietario@example.test");
    const barber = await account("barbeiro@example.test");
    const orgId = await owner.mutation(api.orgs.createOrganization, { name: "Barbearia A" });
    const org = await t.run(ctx => ctx.db.get(orgId));
    await barber.mutation(api.orgs.joinByInviteCode, { code: org!.inviteCode });
    await expect(barber.query(api.clients.list, { organizationId: orgId }))
      .rejects.toThrow(/Sem permissão/i);
    await expect(barber.query(api.cash.currentSession, { organizationId: orgId }))
      .rejects.toThrow(/Sem permissão/i);
    await expect(barber.query(api.orgs.listMembers, { organizationId: orgId }))
      .rejects.toThrow(/Sem permissão/i);
    await expect(barber.mutation(api.orgs.regenerateInviteCode, { organizationId: orgId }))
      .rejects.toThrow(/Sem permissão/i);
    await expect(barber.mutation(api.orgs.updateMemberRole, {
      organizationId: orgId, memberId: (await owner.query(api.orgs.listMembers, { organizationId: orgId }))[1]._id,
      role: "owner",
    })).rejects.toThrow(/Apenas o proprietário/i);
  });

  test("proprietário pode conceder caixa; caixa opera módulos previstos, não controla equipe", async () => {
    const owner = await account("proprietario@example.test");
    const cashier = await account("caixa@example.test");
    const orgId = await owner.mutation(api.orgs.createOrganization, { name: "Barbearia A" });
    const org = await t.run(ctx => ctx.db.get(orgId));
    await cashier.mutation(api.orgs.joinByInviteCode, { code: org!.inviteCode });
    const me = (await owner.query(api.orgs.listMembers, { organizationId: orgId }))
      .find(m => m.email === "caixa@example.test")!;
    await owner.mutation(api.orgs.updateMemberRole, { organizationId: orgId, memberId: me._id, role: "cashier" });
    expect((await cashier.query(api.orgs.getOrgContext, { organizationId: orgId })).member.role)
      .toBe("cashier");
    expect((await cashier.query(api.clients.list, { organizationId: orgId })).total).toBe(0);
    expect(await cashier.query(api.cash.currentSession, { organizationId: orgId })).toBeDefined();
    await expect(cashier.mutation(api.orgs.regenerateInviteCode, { organizationId: orgId }))
      .rejects.toThrow(/Sem permissão/i);
    await expect(cashier.mutation(api.orgs.removeMember, { organizationId: orgId, memberId: me._id }))
      .rejects.toThrow(/Apenas o proprietário/i);
  });

  test("o portal individual precisa do vínculo profissional e proíbe vínculos repetidos", async () => {
    const owner = await account("proprietario@example.test");
    const barber1 = await account("barbeiro1@example.test");
    const barber2 = await account("barbeiro2@example.test");
    const orgId = await owner.mutation(api.orgs.createOrganization, { name: "Barbearia A" });
    const org = await t.run(ctx => ctx.db.get(orgId));
    await barber1.mutation(api.orgs.joinByInviteCode, { code: org!.inviteCode });
    await barber2.mutation(api.orgs.joinByInviteCode, { code: org!.inviteCode });
    expect((await barber1.query(api.barberPortal.myWorkspace, { organizationId: orgId })).linked)
      .toBe(false);
    const barberId = await owner.mutation(api.barbers.create, {
      organizationId: orgId, name: "Profissional Fictício",
    });
    const ms = await owner.query(api.orgs.listMembers, { organizationId: orgId });
    const m1 = ms.find(m => m.email === "barbeiro1@example.test")!;
    const m2 = ms.find(m => m.email === "barbeiro2@example.test")!;
    await expect(barber1.mutation(api.barbers.linkToMember, {
      organizationId: orgId, memberId: m1._id, barberId,
    })).rejects.toThrow(/Sem permissão/i);
    await owner.mutation(api.barbers.linkToMember, { organizationId: orgId, memberId: m1._id, barberId });
    const workspace = await barber1.query(api.barberPortal.myWorkspace, { organizationId: orgId });
    expect(workspace.linked).toBe(true);
    expect(workspace.profile?.name).toBe("Profissional Fictício");
    await expect(owner.mutation(api.barbers.linkToMember, {
      organizationId: orgId, memberId: m2._id, barberId,
    })).rejects.toThrow(/já está vinculado/i);
    expect((await barber2.query(api.barberPortal.myWorkspace, { organizationId: orgId })).linked)
      .toBe(false);
  });

  test("funcionário da barbearia A não acessa informações ou gestão da barbearia B", async () => {
    const ownerA = await account("dono-a@example.test");
    const ownerB = await account("dono-b@example.test");
    const employeeA = await account("empregado-a@example.test");
    const orgA = await ownerA.mutation(api.orgs.createOrganization, { name: "Barbearia A" });
    const orgB = await ownerB.mutation(api.orgs.createOrganization, { name: "Barbearia B" });
    const codeA = (await t.run(ctx => ctx.db.get(orgA)))!.inviteCode;
    await employeeA.mutation(api.orgs.joinByInviteCode, { code: codeA });
    const myOrgs = await employeeA.query(api.orgs.myOrganizations, {});
    expect(myOrgs).toHaveLength(1);
    expect(myOrgs[0].org._id).toBe(orgA);
    await expect(employeeA.query(api.orgs.getOrgContext, { organizationId: orgB }))
      .rejects.toThrow(/não tem acesso/i);
    await expect(employeeA.query(api.clients.list, { organizationId: orgB }))
      .rejects.toThrow(/não tem acesso/i);
    await expect(ownerA.query(api.orgs.listMembers, { organizationId: orgB }))
      .rejects.toThrow(/não tem acesso/i);
  });

  test("remoção revoga imediatamente a leitura e a operação da conta", async () => {
    const owner = await account("proprietario@example.test");
    const employee = await account("funcionario@example.test");
    const orgId = await owner.mutation(api.orgs.createOrganization, { name: "Barbearia A" });
    const code = (await t.run(ctx => ctx.db.get(orgId)))!.inviteCode;
    await employee.mutation(api.orgs.joinByInviteCode, { code });
    const member = (await owner.query(api.orgs.listMembers, { organizationId: orgId }))
      .find(m => m.email === "funcionario@example.test")!;
    await owner.mutation(api.orgs.removeMember, { organizationId: orgId, memberId: member._id });
    await expect(employee.query(api.orgs.getOrgContext, { organizationId: orgId }))
      .rejects.toThrow(/não tem acesso/i);
    expect(await employee.query(api.orgs.myOrganizations, {})).toEqual([]);
  });

  test("remoção invalida convite anterior, impede reentrada e permite novos convidados", async () => {
    const owner = await account("proprietario@example.test");
    const employee = await account("funcionario@example.test");
    const retained = await account("ativo@example.test");
    const newcomer = await account("novo@example.test");
    const orgId = await owner.mutation(api.orgs.createOrganization, { name: "Barbearia A" });
    const code = (await t.run(ctx => ctx.db.get(orgId)))!.inviteCode;
    await employee.mutation(api.orgs.joinByInviteCode, { code });
    await retained.mutation(api.orgs.joinByInviteCode, { code });
    const member = (await owner.query(api.orgs.listMembers, { organizationId: orgId }))
      .find(m => m.email === "funcionario@example.test")!;
    await owner.mutation(api.orgs.removeMember, { organizationId: orgId, memberId: member._id });

    const rotated = (await t.run(ctx => ctx.db.get(orgId)))!.inviteCode;
    expect(rotated).toMatch(/^[A-Z0-9]{12}$/);
    expect(rotated).not.toBe(code);
    expect(await employee.mutation(api.orgs.joinByInviteCode, { code }))
      .toEqual({ ok: false, error: "Código de convite inválido." });
    await expect(employee.query(api.orgs.getOrgContext, { organizationId: orgId }))
      .rejects.toThrow(/não tem acesso/i);

    // Um membro ainda ativo conserva o acesso sem precisar aceitar outro convite.
    expect((await retained.query(api.orgs.getOrgContext, { organizationId: orgId })).member.role)
      .toBe("barber");
    expect(await newcomer.mutation(api.orgs.joinByInviteCode, { code }))
      .toEqual({ ok: false, error: "Código de convite inválido." });
    expect(await newcomer.mutation(api.orgs.joinByInviteCode, { code: rotated }))
      .toEqual({ ok: true, organizationId: orgId });

    const members = await owner.query(api.orgs.listMembers, { organizationId: orgId });
    expect(members.map(m => m.email).sort()).toEqual([
      "ativo@example.test", "novo@example.test", "proprietario@example.test",
    ]);
  });

  test("apenas proprietário da organização pode remover e girar seu convite", async () => {
    const ownerA = await account("proprietario-a@example.test");
    const ownerB = await account("proprietario-b@example.test");
    const employeeA = await account("funcionario-a@example.test");
    const orgA = await ownerA.mutation(api.orgs.createOrganization, { name: "Barbearia A" });
    const orgB = await ownerB.mutation(api.orgs.createOrganization, { name: "Barbearia B" });
    const initialA = (await t.run(ctx => ctx.db.get(orgA)))!.inviteCode;
    const initialB = (await t.run(ctx => ctx.db.get(orgB)))!.inviteCode;
    await employeeA.mutation(api.orgs.joinByInviteCode, { code: initialA });
    const member = (await ownerA.query(api.orgs.listMembers, { organizationId: orgA }))
      .find(m => m.email === "funcionario-a@example.test")!;

    await expect(ownerB.mutation(api.orgs.removeMember, {
      organizationId: orgA, memberId: member._id,
    })).rejects.toThrow(/não tem acesso/i);
    await expect(employeeA.mutation(api.orgs.removeMember, {
      organizationId: orgA, memberId: member._id,
    })).rejects.toThrow(/Apenas o proprietário/i);

    expect((await t.run(ctx => ctx.db.get(orgA)))!.inviteCode).toBe(initialA);
    expect((await t.run(ctx => ctx.db.get(orgB)))!.inviteCode).toBe(initialB);
    await ownerA.mutation(api.orgs.removeMember, { organizationId: orgA, memberId: member._id });
    expect((await t.run(ctx => ctx.db.get(orgA)))!.inviteCode).not.toBe(initialA);
    expect((await t.run(ctx => ctx.db.get(orgB)))!.inviteCode).toBe(initialB);
  });
});
