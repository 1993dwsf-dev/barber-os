import { describe, expect, it } from "vitest";
import { toCSV } from "../src/lib/format";

describe("CSV Excel pt-BR", () => {
  it("exporta colunas separadas por ponto e vírgula e mantém vírgula decimal", () => {
    expect(toCSV(["Data", "Valor", "Cliente"], [
      ["25/10/2026", "50,90", "Maria"],
      ["26/10/2026", "-12,50", "Ana"],
    ])).toBe("Data;Valor;Cliente\r\n25/10/2026;50,90;Maria\r\n26/10/2026;-12,50;Ana");
  });

  it("escapa aspas, ponto e vírgula e quebras de linha conforme CSV", () => {
    expect(toCSV(["Descrição"], [
      ['Boné "preto"; especial'],
      ["Linha 1\nLinha 2"],
      ["Linha 1\rLinha 2"],
    ])).toBe('Descrição\r\n"Boné ""preto""; especial"\r\n"Linha 1\nLinha 2"\r\n"Linha 1\rLinha 2"');
  });

  it("neutraliza fórmulas em campos de usuários, inclusive após espaços e tabulações", () => {
    expect(toCSV(["Cliente", "Observação"], [
      ["=1+1", "+SUM(1,2)"],
      ["  @cmd", "\t=HYPERLINK(\"https://example.test\")"],
      ["-SUM(2,3)", "-1,00"],
      ["+15,00", 900],
    ])).toBe([
      "Cliente;Observação",
      "'=1+1;'+SUM(1,2)",
      "'  @cmd;\"'\t=HYPERLINK(\"\"https://example.test\"\")\"",
      "'-SUM(2,3);-1,00",
      "+15,00;900",
    ].join("\r\n"));
  });

  it("gera um cabeçalho mesmo quando não há registros", () => {
    expect(toCSV(["Data", "Valor"], [])).toBe("Data;Valor");
  });
});
