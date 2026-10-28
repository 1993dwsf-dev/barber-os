import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadCSV, toCSV } from "../src/lib/format";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("download de CSV para Excel", () => {
  it("cria arquivo .csv UTF-8 com BOM, preserva delimitador pt-BR e dispara clique", async () => {
    let clicked = 0;
    let cleanup: (() => void) | undefined;
    const link = { href: "", download: "", click: () => { clicked++; } };
    const createObjectURL = vi.fn(() => "blob:https://barber-os.pages.dev/ficticio");
    const revokeObjectURL = vi.fn();
    const createElement = vi.fn((tag: string) => {
      expect(tag).toBe("a");
      return link;
    });
    vi.stubGlobal("document", { createElement });
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    vi.stubGlobal("window", {
      setTimeout: (callback: () => void, ms: number) => {
        expect(ms).toBe(1000);
        cleanup = callback;
        return 1;
      },
    });

    const csv = toCSV(["Data", "Valor"], [["28/10/2026", "45,00"]]);
    downloadCSV("vendas-demo.csv", csv);

    expect(clicked).toBe(1);
    expect(link.href).toBe("blob:https://barber-os.pages.dev/ficticio");
    expect(link.download).toBe("vendas-demo.csv");
    expect(createElement).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("text/csv;charset=utf-8");
    expect(await blob.text()).toBe("\uFEFFData;Valor\r\n28/10/2026;45,00");
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(cleanup).toBeTypeOf("function");
    cleanup?.();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:https://barber-os.pages.dev/ficticio");
  });

  it("sanitiza caracteres inválidos no nome do arquivo e evita duplicar extensão", () => {
    const link = { href: "", download: "", click: vi.fn() };
    vi.stubGlobal("document", { createElement: () => link });
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:teste",
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal("window", { setTimeout: vi.fn() });

    downloadCSV('resumo/2026:10.csv', toCSV(["Indicador"], [["Teste"]]));
    expect(link.download).toBe("resumo_2026_10.csv");
    expect(link.click).toHaveBeenCalledOnce();
  });
});
