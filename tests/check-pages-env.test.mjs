import { expect, test } from "bun:test";
import { checkPagesEnv } from "../scripts/check-pages-env.mjs";

const valid = {
  CF_PAGES_BRANCH: "staging",
  VITE_STAGING_ONLY: "true",
  VITE_CONVEX_URL: "https://friendly-mantis-123.convex.cloud",
};

test("configuração válida de homologação permite construir o site", () => {
  expect(checkPagesEnv(valid)).toEqual([]);
});

test("nunca publica sem URL do Convex", () => {
  expect(checkPagesEnv({ ...valid, VITE_CONVEX_URL: "" })).not.toEqual([]);
});

test("não aceita URL Convex insegura ou falsa", () => {
  for (const url of [
    "http://friendly-mantis-123.convex.cloud",
    "https://example.org",
    "http://localhost:3210",
    "https://friendly-mantis-123.convex.cloud/path",
    "https://friendly-mantis-123.convex.cloud?token=bad",
  ]) {
    expect(checkPagesEnv({ ...valid, VITE_CONVEX_URL: url })).not.toEqual([]);
  }
});

test("não aceita build de main nem publicação sem flag de homologação", () => {
  expect(checkPagesEnv({ ...valid, CF_PAGES_BRANCH: "main" })).not.toEqual([]);
  expect(checkPagesEnv({ ...valid, VITE_STAGING_ONLY: "" })).not.toEqual([]);
});

test("PR de segurança não deve ser publicado como preview do Cloudflare Pages", () => {
  const result = checkPagesEnv({
    ...valid,
    CF_PAGES_BRANCH: "security/p1-tenancy-rbac-uploads",
  });
  expect(result.some((item) => item.includes('Branch de publicação incorreta'))).toBe(true);
});
