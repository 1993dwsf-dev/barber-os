import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../src/convex/_generated/api";
import schema from "../src/convex/schema";
import {
  authorizeEmail,
  authorizeGoogleEmail,
  mayCreateHostedStagingOrganization,
} from "../src/convex/auth/accessPolicy";
import { enabledAuthMethods } from "../src/lib/mvp-auth-config";

const modules = import.meta.glob("../src/convex/**/*.ts");
let t: ReturnType<typeof convexTest<typeof schema>>;
beforeEach(() => {
  vi.unstubAllEnvs();
  t = convexTest(schema, modules);
});
afterEach(() => vi.unstubAllEnvs());

const hosted = {
  siteUrl: "https://unique-tortoise-387.convex.site",
  stagingEmail: "owner@example.test",
  stagingGoogleEmails: "barber@example.test, cashier@example.test",
  commercialEnabled: false,
};

async function verifiedUser(email: string) {
  const { userId, sessionId } = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", {
      email, emailVerificationTime: Date.now(),
    });
    const sessionId = await ctx.db.insert("authSessions", {
      userId, expirationTime: Date.now() + 60 * 60 * 1000,
    });
    return { userId, sessionId };
  });
  const issuer = "https://test.convex.site";
  const subject = `${userId}|${sessionId}`;
  return t.withIdentity({
    issuer, subject, tokenIdentifier: `${issuer}|${subject}`,
    emailVerified: true,
  });
}

describe("homologação: login Google de funcionários convidados", () => {
  test("autoriza somente e-mails exatos do proprietário e da lista Google, com normalização", () => {
    expect(authorizeGoogleEmail(" OWNER@EXAMPLE.TEST ", hosted)).toBe("owner@example.test");
    expect(authorizeGoogleEmail(" Barber@Example.Test ", hosted)).toBe("barber@example.test");
    expect(authorizeGoogleEmail("cashier@example.test", hosted)).toBe("cashier@example.test");
    expect(() => authorizeGoogleEmail("intruso@example.test", hosted)).toThrow(/restrita/i);
    expect(() => authorizeGoogleEmail("barber@example.test.attacker", hosted)).toThrow(/restrita/i);
    expect(() => authorizeGoogleEmail("conta-invalida", hosted)).toThrow(/válido/i);
  });

  test("sem variável extra, mantém allowlist original e não altera OTP/senha", () => {
    const original = { ...hosted, stagingGoogleEmails: undefined };
    expect(authorizeGoogleEmail("owner@example.test", original)).toBe("owner@example.test");
    expect(() => authorizeGoogleEmail("barber@example.test", original)).toThrow(/restrita/i);
    expect(authorizeEmail("owner@example.test", hosted)).toBe("owner@example.test");
    expect(() => authorizeEmail("barber@example.test", hosted)).toThrow(/restrita/i);
    expect(() => authorizeGoogleEmail("barber@example.test", {
      ...hosted, stagingEmail: undefined,
    })).toThrow(/restrita/i);
  });

  test("lista malformada ou superior a dez e-mails falha fechada", () => {
    expect(() => authorizeGoogleEmail("barber@example.test", {
      ...hosted, stagingGoogleEmails: "barber@example.test,*",
    })).toThrow(/inválida/i);
    expect(() => authorizeGoogleEmail("barber@example.test", {
      ...hosted, stagingGoogleEmails:
        Array.from({ length: 11 }, (_, i) => `person${i}@example.test`).join(","),
    })).toThrow(/inválida/i);
  });

  test("dev local e modo comercial mantêm comportamento atual sem afetar homologação", () => {
    expect(authorizeGoogleEmail("qualquer@example.test", {
      ...hosted, siteUrl: "http://127.0.0.1:3210",
    })).toBe("qualquer@example.test");
    expect(authorizeGoogleEmail("qualquer@example.test", {
      ...hosted, commercialEnabled: true,
    })).toBe("qualquer@example.test");
  });

  test("alteração não desliga OTP do proprietário nem abre provedor anônimo", () => {
    expect(enabledAuthMethods({
      googleOnly: false, authV2: true, googleEnabled: true,
      googleCredentials: true, localBackend: false,
    })).toEqual({ otp: true, password: true, google: true, anonymous: false });
    expect(enabledAuthMethods({
      googleOnly: false, authV2: false, googleEnabled: false,
      googleCredentials: false, localBackend: false,
    })).toEqual({ otp: true, password: false, google: false, anonymous: false });
  });

  test("e-mail extra Google não cria barbearia; entra na existente só por convite", async () => {
    vi.stubEnv("CONVEX_SITE_URL", hosted.siteUrl);
    vi.stubEnv("BARBER_STAGING_EMAIL", hosted.stagingEmail);
    vi.stubEnv("BARBER_STAGING_GOOGLE_EMAILS", hosted.stagingGoogleEmails);
    vi.stubEnv("BARBER_AUTH_COMMERCIAL_ENABLED", "false");
    vi.stubEnv("BARBER_BILLING_ENFORCED", "false");

    const owner = await verifiedUser("owner@example.test");
    const barber = await verifiedUser("barber@example.test");
    expect(mayCreateHostedStagingOrganization("barber@example.test", hosted)).toBe(false);
    expect(mayCreateHostedStagingOrganization("owner@example.test", hosted)).toBe(true);

    await expect(barber.mutation(api.orgs.createOrganization, {
      name: "Criação indevida",
    })).rejects.toThrow(/Tenho um convite/i);

    const orgId = await owner.mutation(api.orgs.createOrganization, { name: "Barbearia de testes" });
    const code = (await t.run(ctx => ctx.db.get(orgId)))!.inviteCode;
    expect(await barber.mutation(api.orgs.joinByInviteCode, { code }))
      .toEqual({ ok: true, organizationId: orgId });
    const context = await barber.query(api.orgs.getOrgContext, { organizationId: orgId });
    expect(context.member.role).toBe("barber");
    expect(context.org.inviteCode).toBe("");
  });

  test("guard de criação não altera fluxos antigos quando lista está ausente", () => {
    expect(mayCreateHostedStagingOrganization("outro@example.test", {
      ...hosted, stagingGoogleEmails: undefined,
    })).toBe(true);
    expect(mayCreateHostedStagingOrganization("outro@example.test", {
      ...hosted, siteUrl: "http://localhost:3210",
    })).toBe(true);
    expect(mayCreateHostedStagingOrganization("outro@example.test", {
      ...hosted, commercialEnabled: true,
    })).toBe(true);
  });
});
