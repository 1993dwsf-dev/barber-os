import { expect, test } from "vitest";
import { sandboxLinksCsv } from "../src/lib/asaas-link-csv";

test("CSV contém somente metadados autorizados, sem afirmar receita", () => {
  const csv = sandboxLinksCsv([{
    organizationName: "Barbearia Alfa",
    paymentId: "pay_test123",
    planName: "Essencial",
    priceCents: 5990,
    status: "pending_review",
    createdAt: Date.UTC(2026, 9, 26),
    updatedAt: Date.UTC(2026, 9, 26),
  }]);
  expect(csv.startsWith("\uFEFF")).toBe(true);
  expect(csv).toContain('"Barbearia Alfa";"pay_test123";"Essencial";"59,90"');
  expect(csv).toContain('"Pendente de revisão"');
  expect(csv).toContain('"Não comprova recebimento nem concede acesso"');
  expect(csv.split("\r\n").filter(Boolean)).toHaveLength(2);
  expect(csv).not.toContain("cpf");
});

test("CSV neutraliza fórmulas e escapa aspas e separador", () => {
  const csv = sandboxLinksCsv([{
    organizationName: "=HYPERLINK(\"https://invalid.test\")",
    paymentId: "pay_test123",
    planName: 'Básico; "Promo"',
    priceCents: 1000,
    status: "voided",
    createdAt: 1000,
    updatedAt: 2000,
  }]);
  expect(csv).toContain('"' + "'=HYPERLINK(");
  expect(csv).toContain('"Básico; ""Promo"""');
  expect(csv).toContain('"Invalidado"');
});
