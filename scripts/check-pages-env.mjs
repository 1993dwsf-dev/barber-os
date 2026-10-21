/**
 * Valida a URL pública Convex antes de gerar os assets do Cloudflare Pages.
 * Não carrega chaves privadas e falha em vez de publicar uma página quebrada.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function checkPagesEnv(env) {
  const errors = [];

  if (env.VITE_STAGING_ONLY !== "true") {
    errors.push('Configure VITE_STAGING_ONLY="true" no Cloudflare Pages.');
  }

  if (env.CF_PAGES_BRANCH && env.CF_PAGES_BRANCH !== "staging") {
    errors.push('Branch de publicação incorreta: use "staging", nunca "main".');
  }

  const raw = env.VITE_CONVEX_URL?.trim();
  if (!raw) {
    errors.push("VITE_CONVEX_URL não está configurada no Cloudflare Pages.");
  } else {
    try {
      const url = new URL(raw);
      if (
        url.protocol !== "https:" ||
        !/^[a-z0-9-]+\.convex\.cloud$/i.test(url.hostname) ||
        url.username ||
        url.password ||
        url.port ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      ) {
        errors.push("VITE_CONVEX_URL deve ser a URL HTTPS limpa do deployment Convex (*.convex.cloud).");
      }
    } catch {
      errors.push("VITE_CONVEX_URL não é uma URL válida.");
    }
  }

  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const errors = checkPagesEnv(process.env);
  if (errors.length) {
    for (const err of errors) console.error("[staging] " + err);
    process.exitCode = 1;
  } else {
    console.log("[staging] Configuração pública do Cloudflare Pages validada.");
  }
}
