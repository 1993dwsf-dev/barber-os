import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

const fake = {
  CONVEX_SITE_URL: "https://new-pilot-deployment.convex.site",
  CONVEX_DEPLOYMENT: "prod:new-pilot-deployment",
  SITE_URL: "https://barber-os-comercial.pages.dev",
  BARBER_AUTH_COMMERCIAL_ENABLED: "true",
  BARBER_BILLING_ENFORCED: "true",
  BARBER_AUTH_V2_ENABLED: "true",
  BARBER_GOOGLE_AUTH_ENABLED: "false",
  BARBER_MVP_GOOGLE_ONLY: "false",
  RESEND_API_KEY: "RE_PRIVATE_SENTINEL_123456",
  RESEND_FROM_EMAIL: "Barber OS <acesso@dominio-ficticio.example>",
  JWT_PRIVATE_KEY: "JWT_PRIVATE_SENTINEL_123456",
  JWKS: "JWKS_PRIVATE_SENTINEL_123456",
};

function check(env: Record<string, string>) {
  return spawnSync(process.execPath, ["run", "check:commercial"], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout: 30_000,
  });
}

test("CLI retorna aprovada sem mostrar valores sensíveis ou prometer liberação", () => {
  const result = check(fake);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("Configuração básica aprovada");
  expect(result.stdout).toContain("NÃO equivale à autorização");
  for (const key of ["RESEND_API_KEY", "JWT_PRIVATE_KEY", "JWKS"]) {
    expect(result.stdout).not.toContain(fake[key as keyof typeof fake]);
  }
});

test("CLI bloqueia frontend de homologação e deployment de desenvolvimento", () => {
  const result = check({
    ...fake,
    SITE_URL: "https://barber-os.pages.dev",
    CONVEX_DEPLOYMENT: "dev:new-pilot-deployment",
  });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain("FAIL  isolated-convex");
  expect(result.stdout).toContain("FAIL  public-url");
  expect(result.stdout).toContain("Configuração básica bloqueada");
  expect(result.stdout).not.toContain(fake.RESEND_API_KEY);
});


test("CLI usa Brevo selecionado e não precisa de chaves do Resend", () => {
  const env = {
    ...fake,
    BARBER_EMAIL_PROVIDER: "brevo",
    BREVO_API_KEY: "BREVO_PRIVATE_SENTINEL_98765",
    BREVO_FROM_EMAIL: "Barber OS <teste@gmail.com>",
    RESEND_API_KEY: "",
    RESEND_FROM_EMAIL: "",
  };
  const result = check(env);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("PASS  email-delivery");
  expect(result.stdout).toContain("verificação independente");
  expect(result.stdout).not.toContain(env.BREVO_API_KEY);
  expect(result.stdout).not.toContain(env.BREVO_FROM_EMAIL);
});

test("CLI Brevo sem credenciais recusa liberação mesmo com Resend configurado", () => {
  const result = check({
    ...fake,
    BARBER_EMAIL_PROVIDER: "brevo",
    BREVO_API_KEY: "",
    BREVO_FROM_EMAIL: "",
  });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain("FAIL  email-delivery");
});
