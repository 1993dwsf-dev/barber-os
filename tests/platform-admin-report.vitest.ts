import { describe, expect, test } from "vitest";
import {
  buildAdminUnitsCsv, countTrialWindows, trialWindow,
  type AdminUnitReport,
} from "../src/lib/platform-admin-report";

const now = Date.UTC(2026, 9, 26, 12, 0, 0);
const day = 86_400_000;

function unit(overrides: Partial<AdminUnitReport> = {}): AdminUnitReport {
  return {
    id: "org-001",
    name: "Barbearia Aurora",
    isDemo: false,
    createdAt: now - day,
    plan: "pilot",
    status: "trialing",
    trialEndsAt: now + 2 * day,
    periodEndsAt: null,
    ...overrides,
  };
}

describe("janela comercial do teste", () => {
  test("classifica exatamente a janela de 7 dias", () => {
    expect(trialWindow(unit({ trialEndsAt: now + 7 * day }), now)).toBe("due_soon");
    expect(trialWindow(unit({ trialEndsAt: now + 7 * day + 1 }), now)).toBe("ongoing");
    expect(trialWindow(unit({ trialEndsAt: now + 1 }), now)).toBe("due_soon");
    expect(trialWindow(unit({ trialEndsAt: now }), now)).toBe("expired");
    expect(trialWindow(unit({ trialEndsAt: now - day }), now)).toBe("expired");
  });

  test("não considera suspensos como testes próximos do vencimento", () => {
    expect(trialWindow(unit({ status: "suspended", trialEndsAt: now - day }), now)).toBe("not_trial");
    expect(trialWindow(unit({ status: "active" }), now)).toBe("not_trial");
    expect(trialWindow(unit({ trialEndsAt: null }), now)).toBe("missing_deadline");
    expect(countTrialWindows([
      unit(), unit({ trialEndsAt: now }), unit({ trialEndsAt: null }),
      unit({ status: "suspended", trialEndsAt: now - day }),
    ], now)).toEqual({ dueSoon: 1, expired: 1, missingDeadline: 1 });
  });
});

describe("CSV interno", () => {
  test("gera texto UTF-8 com BOM, cabeçalho e datas ISO para Excel", () => {
    const csv = buildAdminUnitsCsv([unit()], now);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"ID da unidade";"Barbearia";');
    expect(csv).toContain('"Barbearia Aurora"');
    expect(csv).toContain('"2026-10-25"');
    expect(csv).toContain('"Vence em até 7 dias"');
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(2);
  });

  test("escapa aspas, delimitadores, quebra de linha e fórmulas maliciosas", () => {
    const csv = buildAdminUnitsCsv([
      unit({ name: '=HYPERLINK("https://invalid.test")' }),
      unit({ id: "org-002", name: 'Barbearia; "A"\nSul' }),
      unit({ id: "org-003", name: "   @SUM(1+1)" }),
      unit({ id: "org-004", name: "+1+2" }),
    ], now);
    expect(csv).toContain('"' + "'=HYPERLINK(" + '""https://invalid.test"")"');
    expect(csv).toContain('"Barbearia; ""A""\nSul"');
    expect(csv).toContain('"\'   @SUM(1+1)"');
    expect(csv).toContain('"\'+1+2"');
    expect(csv).not.toContain("owner@example.test");
  });

  test("relatório vazio contém só cabeçalho, não dados privados", () => {
    const csv = buildAdminUnitsCsv([], now);
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(1);
    expect(csv).not.toContain("client");
  });
});
