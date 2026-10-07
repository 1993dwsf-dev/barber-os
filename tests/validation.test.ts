import { describe, expect, test } from "bun:test";
import {
  TEXT_LIMITS,
  dateISO,
  hexColor,
  requiredText,
  text,
  textList,
  timeLabel,
} from "../src/convex/validation";

/**
 * Regras de validação dos campos de texto/formatos aceitos pelos mutators.
 * São limites de segurança: sem eles um cliente podia gravar megabytes em um
 * campo "observações" ou datas inválidas que quebravam relatórios.
 */

describe("text", () => {
  test("normaliza espaços e devolve undefined para vazio", () => {
    expect(text("  Corte  ", "name", "Nome")).toBe("Corte");
    expect(text("   ", "name", "Nome")).toBeUndefined();
    expect(text(undefined, "name", "Nome")).toBeUndefined();
  });

  test("recusa texto acima do limite", () => {
    expect(() => text("x".repeat(TEXT_LIMITS.note + 1), "note", "Observações")).toThrow();
    expect(text("x".repeat(TEXT_LIMITS.note), "note", "Observações")).toHaveLength(
      TEXT_LIMITS.note,
    );
  });
});

describe("requiredText", () => {
  test("exige conteúdo", () => {
    expect(() => requiredText("   ", "name", "Nome")).toThrow();
    expect(requiredText(" Barbearia Alfa ", "name", "Nome")).toBe("Barbearia Alfa");
  });
});

describe("textList", () => {
  test("limita quantidade e tamanho dos itens", () => {
    expect(textList(["a", " b "], "reference", 3, "Benefícios")).toEqual(["a", "b"]);
    expect(() => textList(["a", "b"], "reference", 1, "Benefícios")).toThrow();
    expect(() => textList(["x".repeat(TEXT_LIMITS.reference + 1)], "reference", 3, "B")).toThrow();
  });
});

describe("timeLabel", () => {
  test("aceita HH:MM válido", () => {
    expect(timeLabel("09:30", "Horário")).toBe("09:30");
    expect(timeLabel("23:59", "Horário")).toBe("23:59");
  });

  test("recusa horários fora de 00:00–23:59", () => {
    for (const invalid of ["24:00", "9:30", "09:60", "0930", "", "09:30:00"]) {
      expect(() => timeLabel(invalid, "Horário")).toThrow();
    }
  });
});

describe("dateISO", () => {
  test("aceita datas existentes", () => {
    expect(dateISO("2026-10-07", "Data")).toBe("2026-10-07");
    expect(dateISO("2024-02-29", "Data")).toBe("2024-02-29");
  });

  test("recusa formatos e datas inexistentes", () => {
    for (const invalid of ["07/10/2026", "2026-2-3", "2026-02-31", "2026-13-01", "hoje"]) {
      expect(() => dateISO(invalid, "Data")).toThrow();
    }
  });
});

describe("hexColor", () => {
  test("aceita #RRGGBB e normaliza para minúsculas", () => {
    expect(hexColor("#B45309", "Cor")).toBe("#b45309");
    expect(hexColor(undefined, "Cor")).toBeUndefined();
  });

  test("recusa valores que não são cor", () => {
    for (const invalid of ["b45309", "#b4530", "#b4530999", "red", "javascript:alert(1)"]) {
      expect(() => hexColor(invalid, "Cor")).toThrow();
    }
  });
});
