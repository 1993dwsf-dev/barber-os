/** Valida a configuração pública usada pelo Cloudflare Pages antes do build. */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const STAGING_CONVEX = "unique-tortoise-387.convex.cloud";

export function checkPagesEnv(env) {
  const errors = [];
  const staging = env.VITE_STAGING_ONLY === "true";
  const production = env.VITE_STAGING_ONLY === "false" && env.VITE_PRODUCTION_ENABLED === "true";

  if (!staging && !production) {
    errors.push('Defina VITE_STAGING_ONLY="true" para homologação ou VITE_STAGING_ONLY="false" e VITE_PRODUCTION_ENABLED="true" para produção.');
  }
  if (staging && env.CF_PAGES_BRANCH && env.CF_PAGES_BRANCH !== "staging") {
    errors.push('Branch de publicação incorreta: use "staging", nunca "main".');
  }
  if (production && env.CF_PAGES_BRANCH !== "production") {
    errors.push('Produção exige CF_PAGES_BRANCH="production".');
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
        url.username || url.password || url.port ||
        url.pathname !== "/" || url.search || url.hash
      ) {
        errors.push("VITE_CONVEX_URL deve ser a URL HTTPS limpa do deployment Convex (*.convex.cloud).");
      }
      if (production && url.hostname === STAGING_CONVEX) {
        errors.push("Produção não pode usar o deployment Convex conhecido de homologação.");
      }
    } catch {
      errors.push("VITE_CONVEX_URL não é uma URL válida.");
    }
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const errors = checkPagesEnv(process.env);
  const mode = process.env.VITE_STAGING_ONLY === "true" ? "staging" : "production";
  if (errors.length) {
    for (const err of errors) console.error("[" + mode + "] " + err);
    process.exitCode = 1;
  } else {
    console.log("[" + mode + "] Configuração pública do Cloudflare Pages validada.");
  }
}
