import { expect, test } from "bun:test";
import { authorizeEmail, authorizeTransactionalEmail } from "../src/convex/auth/accessPolicy";

test("autorização normaliza e-mail e permite somente o titular na homologação", () => {
  const c = { siteUrl: "https://demo.convex.site", stagingEmail: "TITULAR@EXAMPLE.COM", commercialEnabled: false };
  expect(authorizeEmail(" Titular@Example.com ", c)).toBe("titular@example.com");
  expect(() => authorizeEmail("intruso@example.com", c)).toThrow();
  expect(() => authorizeEmail("qualquercoisa", c)).toThrow();
});

test("homologação não abre cadastros quando e-mail permitido não está configurado", () => {
  expect(() => authorizeEmail("pessoa@example.com", {
    siteUrl: "https://demo.convex.site",
    commercialEnabled: false,
  })).toThrow();
});

test("backend local permite usuários fictícios para testes", () => {
  expect(authorizeEmail("qa@example.com", {
    siteUrl: "http://127.0.0.1:3210",
    commercialEnabled: false,
  })).toBe("qa@example.com");
});

test("abertura comercial explícita permite e-mails válidos", () => {
  expect(authorizeEmail("nova@barbearia.com.br", {
    siteUrl: "https://demo.convex.site",
    commercialEnabled: true,
  })).toBe("nova@barbearia.com.br");
});

test("códigos OTP, verificação e reset preservam allowlist em homologação", () => {
  const config = {
    siteUrl: "https://barber-os-homologacao.convex.site",
    commercialEnabled: false,
    stagingEmail: "Proprietario@Example.com",
    fromEmail: "Barber OS <onboarding@resend.dev>",
  };
  expect(authorizeTransactionalEmail(" proprietario@example.com ", config))
    .toBe("proprietario@example.com");
  expect(() => authorizeTransactionalEmail("outra@barbearia.com.br", config))
    .toThrow(/homologação/i);
  expect(() => authorizeTransactionalEmail("titular@example.com", {
    ...config, stagingEmail: undefined,
  })).toThrow(/homologação/i);
});

test("ambiente comercial exige remetente próprio, sem sandbox resend.dev", () => {
  const config = {
    siteUrl: "https://barber-os-prod.convex.site",
    commercialEnabled: true,
    stagingEmail: "proprietario@example.com",
    fromEmail: "Barber OS <onboarding@resend.dev>",
  };
  expect(() => authorizeTransactionalEmail("novo@barbearia.com.br", config))
    .toThrow(/domínio próprio verificado/i);
  expect(() => authorizeTransactionalEmail("novo@barbearia.com.br", {
    ...config, fromEmail: undefined,
  })).toThrow(/domínio próprio verificado/i);
  expect(() => authorizeTransactionalEmail("novo@barbearia.com.br", {
    ...config, fromEmail: "remetente inválido",
  })).toThrow(/domínio próprio verificado/i);
  expect(authorizeTransactionalEmail(" NOVO@Barbearia.com.br ", {
    ...config, fromEmail: "Barber OS <acesso@barberos.com.br>",
  })).toBe("novo@barbearia.com.br");
  expect(authorizeTransactionalEmail("cliente@barbearia.com.br", {
    ...config, fromEmail: "acesso@barberos.com.br",
  })).toBe("cliente@barbearia.com.br");
});

test("teste local aceita emissor fictício sem liberar destinatários no cloud", () => {
  expect(authorizeTransactionalEmail("qa@example.test", {
    siteUrl: "http://127.0.0.1:3210",
    commercialEnabled: false,
    fromEmail: "Fake Resend <acesso@example.test>",
  })).toBe("qa@example.test");
});
