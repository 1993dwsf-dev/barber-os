import { expect, test } from "bun:test";
import { authorizeEmail } from "../src/convex/auth/accessPolicy";

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
