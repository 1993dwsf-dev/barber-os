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
