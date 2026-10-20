import { defineConfig } from "vitest/config";

/**
 * O runner padrão do projeto é o Bun (`bun test`).
 * A suíte de backend usa `import.meta.glob` (API do Vite) para carregar os
 * módulos do Convex no `convex-test`, então roda no Vitest.
 * O sufixo `.vitest.ts` mantém esses arquivos fora do `bun test`.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.vitest.ts"],
    environment: "node",
  },
});
