import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "../src/convex/_generated/api";
import type { Id } from "../src/convex/_generated/dataModel";
import schema from "../src/convex/schema";
import { defaultSettings, defaultBusinessHours } from "../src/convex/orgs";

const modules = import.meta.glob("../src/convex/**/*.ts");
let t: ReturnType<typeof convexTest<typeof schema>>;
beforeEach(() => {
  t = convexTest(schema, modules);
  vi.unstubAllEnvs();
});
afterEach(() => vi.unstubAllEnvs());

async function account(email: string, verified = true) {
  const { userId, sessionId } = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", {
      name: email,
      email,
      ...(verified ? { emailVerificationTime: Date.now() } : {}),
    });
    const sessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 3600_000,
    });
    return { userId, sessionId };
  });
  const subject = `${userId}|${sessionId}`;
  const token = "https://test.convex.site";
  const caller = t.withIdentity({
    issuer: token, subject, tokenIdentifier: `${token}|${subject}`, emailVerified: verified,
  });
  return { userId, caller };
}

test("admin fica fechado sem configuração exata das duas variáveis", async () => {
  const admin = await account("admin@example.test");
  expect(await admin.caller.query(api.platformAdmin.access, {})).toBe(false);
  await expect(admin.caller.query(api.platformAdmin.overview, {})).rejects.toThrow(/restrito/i);

  vi.stubEnv("BARBER_PLATFORM_ADMIN_EMAIL", "admin@example.test");
  expect(await admin.caller.query(api.platformAdmin.access, {})).toBe(false);
  await expect(admin.caller.query(api.platformAdmin.overview, {})).rejects.toThrow(/restrito/i);
});

test("conta autorizada vê só metadados mínimos de unidades, e proprietário externo não vê nada", async () => {
  const admin = await account("admin@example.test");
  const stranger = await account("owner@example.test");
  await admin.caller.mutation(api.orgs.createOrganization, { name: "Unidade de Teste A" });
  await stranger.caller.mutation(api.orgs.createOrganization, { name: "Unidade de Teste B" });

  vi.stubEnv("BARBER_PLATFORM_ADMIN_USER_ID", admin.userId);
  vi.stubEnv("BARBER_PLATFORM_ADMIN_EMAIL", " ADMIN@example.test ");
  expect(await admin.caller.query(api.platformAdmin.access, {})).toBe(true);
  expect(await stranger.caller.query(api.platformAdmin.access, {})).toBe(false);
  await expect(stranger.caller.query(api.platformAdmin.overview, {})).rejects.toThrow(/restrito/i);

  const data = await admin.caller.query(api.platformAdmin.overview, {});
  expect(data.summary.organizationsShown).toBe(2);
  expect(data.organizations.map(o => o.name).sort()).toEqual(["Unidade de Teste A", "Unidade de Teste B"]);
  expect(data.organizations.every(o => o.status === "unconfigured")).toBe(true);
  expect(data.hasMore).toBe(false);
  const wire = JSON.stringify(data);
  for (const secret of ["owner@example.test", "admin@example.test", "inviteCode", "phone", "ownerId", "settings", "email", "users", "clients", "sales", "secret", "password"]) {
    expect(wire).not.toContain(secret);
  }
});

test("não aceita ID incorreto, e-mail incorreto, conta não verificada ou acesso anônimo", async () => {
  const admin = await account("admin@example.test");
  const outsider = await account("owner@example.test");
  vi.stubEnv("BARBER_PLATFORM_ADMIN_USER_ID", outsider.userId);
  vi.stubEnv("BARBER_PLATFORM_ADMIN_EMAIL", "admin@example.test");
  expect(await admin.caller.query(api.platformAdmin.access, {})).toBe(false);
  expect(await outsider.caller.query(api.platformAdmin.access, {})).toBe(false);

  vi.stubEnv("BARBER_PLATFORM_ADMIN_USER_ID", admin.userId);
  vi.stubEnv("BARBER_PLATFORM_ADMIN_EMAIL", "wrong@example.test");
  expect(await admin.caller.query(api.platformAdmin.access, {})).toBe(false);

  vi.stubEnv("BARBER_PLATFORM_ADMIN_EMAIL", "admin@example.test");
  await t.run(ctx => ctx.db.patch(admin.userId as Id<"users">, { emailVerificationTime: undefined }));
  expect(await admin.caller.query(api.platformAdmin.access, {})).toBe(false);
  await t.run(ctx => ctx.db.patch(admin.userId as Id<"users">, {
    emailVerificationTime: Date.now(),
    isAnonymous: true,
  }));
  expect(await admin.caller.query(api.platformAdmin.access, {})).toBe(false);
});

test("limita listagem a 75 unidades e não declara estatísticas incompletas como total", async () => {
  const admin = await account("admin@example.test");
  vi.stubEnv("BARBER_PLATFORM_ADMIN_USER_ID", admin.userId);
  vi.stubEnv("BARBER_PLATFORM_ADMIN_EMAIL", "admin@example.test");
  await t.run(async ctx => {
    const defaults = {
      ownerId: admin.userId,
      inviteCode: "ZXCVBN123456",
      isDemo: false,
      businessHours: defaultBusinessHours(),
      settings: defaultSettings(),
      salesCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    for (let i = 0; i < 76; i++) {
      await ctx.db.insert("organizations", { ...defaults, name: `Barbearia #${i}` });
    }
  });
  const data = await admin.caller.query(api.platformAdmin.overview, {});
  expect(data.organizations).toHaveLength(75);
  expect(data.summary.organizationsShown).toBe(75);
  expect(data.hasMore).toBe(true);
});
