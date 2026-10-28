import { expect, test } from "bun:test";
import { evaluateCommercialConfig, type CommercialEnv } from "../src/lib/commercial-preflight";

const valid: CommercialEnv = {
  CONVEX_SITE_URL: "https://new-pilot-deployment.convex.site",
  CONVEX_DEPLOYMENT: "prod:new-pilot-deployment",
  SITE_URL: "https://barber-os-pilot.pages.dev",
  BARBER_AUTH_COMMERCIAL_ENABLED: "true",
  BARBER_BILLING_ENFORCED: "true",
  BARBER_AUTH_V2_ENABLED: "true",
  BARBER_GOOGLE_AUTH_ENABLED: "false",
  BARBER_MVP_GOOGLE_ONLY: "false",
  RESEND_API_KEY: "re_ficticia_teste_nao_funciona",
  RESEND_FROM_EMAIL: "Barber OS <acesso@dominio-ficticio.example>",
  JWT_PRIVATE_KEY: "CHAVE FICTICIA NAO FUNCIONA",
  JWKS: "JWKS FICTICIO NAO FUNCIONA",
};

test("preflight lista verificações sem expor os valores dos segredos", () => {
  const result = evaluateCommercialConfig(valid);
  expect(result.configurationReady).toBe(true);
  expect(result.checks).toHaveLength(8);
  expect(result.warning).toMatch(/não autorização/i);
  const output = JSON.stringify(result);
  expect(output).not.toContain(valid.RESEND_API_KEY!);
  expect(output).not.toContain(valid.JWT_PRIVATE_KEY!);
  expect(result.pendingManualVerification).toContain(
    "Executar backup gerenciado e restauração testada num ambiente descartável.",
  );
});

test("recusa explicitamente o deployment Convex de homologação original", () => {
  const result = evaluateCommercialConfig({
    ...valid, CONVEX_SITE_URL: "https://unique-tortoise-387.convex.site",
    CONVEX_DEPLOYMENT: "dev:unique-tortoise-387",
  });
  expect(result.configurationReady).toBe(false);
  expect(result.checks.find(x => x.id === "isolated-convex")?.passed).toBe(false);
});

test("sem flags comerciais e sem cobrança, falha fechado", () => {
  const result = evaluateCommercialConfig({
    ...valid, BARBER_AUTH_COMMERCIAL_ENABLED: "false",
    BARBER_BILLING_ENFORCED: "false",
  });
  expect(result.configurationReady).toBe(false);
  expect(result.checks.find(x => x.id === "commercial-invitations")?.passed).toBe(false);
  expect(result.checks.find(x => x.id === "enforced-entitlements")?.passed).toBe(false);
});

test("remetente de sandbox, segredo ausente e HTTP impedem prontidão", () => {
  const result = evaluateCommercialConfig({
    ...valid, RESEND_FROM_EMAIL: "onboarding@resend.dev",
    RESEND_API_KEY: "", SITE_URL: "http://localhost:5173",
    JWT_PRIVATE_KEY: "",
  });
  expect(result.configurationReady).toBe(false);
  expect(result.checks.find(x => x.id === "email-delivery")?.passed).toBe(false);
  expect(result.checks.find(x => x.id === "public-url")?.passed).toBe(false);
  expect(result.checks.find(x => x.id === "auth-keys")?.passed).toBe(false);
});

test("modo exclusivamente Google contradiz a autenticação escolhida para o piloto", () => {
  const result = evaluateCommercialConfig({
    ...valid, BARBER_MVP_GOOGLE_ONLY: "true", BARBER_GOOGLE_AUTH_ENABLED: "true",
  });
  expect(result.configurationReady).toBe(false);
  expect(result.checks.find(x => x.id === "password-login")?.passed).toBe(false);
  expect(result.checks.find(x => x.id === "google-disabled")?.passed).toBe(false);
});


test("deployment de desenvolvimento diferente do original não é aceito em ambiente comercial", () => {
  const result = evaluateCommercialConfig({
    ...valid,
    CONVEX_DEPLOYMENT: "dev:new-pilot-deployment",
  });
  expect(result.checks.find(c => c.id === "isolated-convex")?.passed).toBe(false);
  expect(result.configurationReady).toBe(false);
});

test("deployment de produção ausente ou divergente do URL Convex falha fechado", () => {
  for (const deployment of [undefined, "", "prod:outro-deployment", "prod:new-pilot-deployment|secret"]) {
    const result = evaluateCommercialConfig({ ...valid, CONVEX_DEPLOYMENT: deployment });
    expect(result.checks.find(c => c.id === "isolated-convex")?.passed).toBe(false);
  }
});

test("site comercial não pode apontar para o Cloudflare Pages de homologação", () => {
  for (const site of [
    "https://barber-os.pages.dev",
    "https://barber-os-piloto.pages.dev",
    "https://abc123.barber-os.pages.dev",
    "https://preview.barber-os-piloto.pages.dev",
  ]) {
    const result = evaluateCommercialConfig({ ...valid, SITE_URL: site });
    expect(result.checks.find(c => c.id === "public-url")?.passed).toBe(false);
    expect(result.configurationReady).toBe(false);
  }
});

test("site comercial separado no domínio gratuito pages.dev continua permitido", () => {
  const result = evaluateCommercialConfig(valid);
  expect(result.checks.find(c => c.id === "public-url")?.passed).toBe(true);
  expect(result.checks.find(c => c.id === "isolated-convex")?.passed).toBe(true);
  expect(result.configurationReady).toBe(true);
});
