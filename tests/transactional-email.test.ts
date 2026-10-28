import { expect, test } from "bun:test";
import {
  buildTransactionalEmailRequest,
  selectTransactionalEmailProvider,
} from "../src/lib/transactional-email";

test("Resend permanece padrão e seleção inválida falha fechada", () => {
  expect(selectTransactionalEmailProvider(undefined)).toBe("resend");
  expect(selectTransactionalEmailProvider("")).toBe("resend");
  expect(selectTransactionalEmailProvider(" Brevo ")).toBe("brevo");
  expect(() => selectTransactionalEmailProvider("smtp")).toThrow(/não reconhecido/i);
});

test("compatibilidade do envio atual via Resend permanece inalterada", () => {
  const result = buildTransactionalEmailRequest({
    provider: "resend",
    apiKey: "TEST_RESEND_TOKEN_NEVER_LIVE",
    from: "Barber OS <onboarding@resend.dev>",
    to: "titular@example.test",
    subject: "Seu código de acesso",
    text: "Código fictício 123456",
  });
  expect(result.url).toBe("https://api.resend.com/emails");
  expect(result.init.headers.Authorization).toBe("Bearer TEST_RESEND_TOKEN_NEVER_LIVE");
  expect(JSON.parse(result.init.body)).toEqual({
    from: "Barber OS <onboarding@resend.dev>",
    to: ["titular@example.test"],
    subject: "Seu código de acesso",
    text: "Código fictício 123456",
  });
});

test("Brevo gera corpo API v3 de transação, remetente separado e chave privada", () => {
  const result = buildTransactionalEmailRequest({
    provider: "brevo",
    apiKey: "TEST_BREVO_TOKEN_NEVER_LIVE",
    from: "Barber OS <tester@example.test>",
    to: "titular@example.test",
    subject: "Recuperação de senha",
    text: "Código fictício 12345678",
  });
  expect(result.url).toBe("https://api.brevo.com/v3/smtp/email");
  expect(result.init.method).toBe("POST");
  expect(result.init.headers["api-key"]).toBe("TEST_BREVO_TOKEN_NEVER_LIVE");
  expect(result.init.headers.Authorization).toBeUndefined();
  expect(JSON.parse(result.init.body)).toEqual({
    sender: { name: "Barber OS", email: "tester@example.test" },
    to: [{ email: "titular@example.test" }],
    subject: "Recuperação de senha",
    textContent: "Código fictício 12345678",
  });
  expect(result.init.body).not.toContain("TEST_BREVO_TOKEN_NEVER_LIVE");
});

test("Brevo aceita email remetente simples e recusa configuração inválida", () => {
  const valid = buildTransactionalEmailRequest({
    provider: "brevo", apiKey: "mock", from: "tester@example.test",
    to: "titular@example.test", subject: "Teste", text: "Teste",
  });
  expect(JSON.parse(valid.init.body).sender).toEqual({
    name: "Barber OS", email: "tester@example.test",
  });
  expect(() => buildTransactionalEmailRequest({
    provider: "brevo", apiKey: "mock", from: "remetente inválido",
    to: "titular@example.test", subject: "Teste", text: "Teste",
  })).toThrow(/remetente brevo inválido/i);
  expect(() => buildTransactionalEmailRequest({
    provider: "brevo", apiKey: "", from: "tester@example.test",
    to: "titular@example.test", subject: "Teste", text: "Teste",
  })).toThrow(/incompleta/i);
});
