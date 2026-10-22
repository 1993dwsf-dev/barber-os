/**
 * Prepara as chaves do Convex Auth somente para um deployment cloud de teste.
 *
 * Executar no Codespaces, dentro do repositório (nunca neste chat):
 *   node scripts/configure-staging-auth-keys.mjs unique-tortoise-387
 *
 * Regras:
 * - seleciona explicitamente o deployment, sem depender de .env.local
 * - confirma que as variáveis do Resend já existem (apenas seus nomes)
 * - não sobrescreve chaves de autenticação existentes
 * - gera e transmite as chaves diretamente ao Convex por stdin
 * - não imprime ou grava segredos em disco
 */
import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REQUIRED = ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "BARBER_STAGING_EMAIL"];
const AUTH_KEYS = ["JWT_PRIVATE_KEY", "JWKS"];

export function validDeploymentName(value) {
  // Nomes de deployments Convex: três palavras / números, separados por hífens.
  return typeof value === "string" && /^[a-z][a-z0-9-]{2,80}$/.test(value);
}

export function generateAuthKeys() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicExponent: 0x10001,
  });
  // Mesmo formato indicado no setup manual do Convex Auth.
  const privatePem = privateKey
    .export({ format: "pem", type: "pkcs8" })
    .trimEnd()
    .replace(/\r?\n/g, " ");
  const publicJwk = publicKey.export({ format: "jwk" });
  return {
    JWT_PRIVATE_KEY: privatePem,
    JWKS: JSON.stringify({ keys: [{ use: "sig", ...publicJwk }] }),
  };
}

function convex(args, { input } = {}) {
  const result = spawnSync("bunx", ["convex", ...args], {
    input,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 1024 * 1024,
    // Não copiar a chave para argumentos, logs ou arquivo.
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      "Falha ao acessar o Convex. Confirme a autenticação no Codespaces " +
        "e o nome do deployment. Consulte o painel do Convex para detalhes.",
    );
  }
  return result.stdout ?? "";
}

export function assessVariables(names) {
  const missingRequired = REQUIRED.filter((key) => !names.has(key));
  const presentKeys = AUTH_KEYS.filter((key) => names.has(key));
  return { missingRequired, presentKeys };
}

function main() {
  const deployment = process.argv[2];
  if (!validDeploymentName(deployment) || process.argv.length !== 3) {
    throw new Error(
      "Use: node scripts/configure-staging-auth-keys.mjs unique-tortoise-387",
    );
  }
  if (deployment !== "unique-tortoise-387") {
    throw new Error("Script autorizado apenas para o Development (Cloud) unique-tortoise-387.");
  }
  console.log("[Convex] Verificando o deployment:", deployment);
  const listArgs = ["env", "list", "--names-only", "--deployment", deployment];
  const before = new Set(convex(listArgs).split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
  const { missingRequired, presentKeys } = assessVariables(before);
  if (missingRequired.length) {
    throw new Error(
      "Variáveis ausentes no deployment selecionado: " +
        missingRequired.join(", ") +
        ". Configure-as no painel do Convex e execute novamente.",
    );
  }
  if (presentKeys.length === AUTH_KEYS.length) {
    console.log("[Convex] JWT_PRIVATE_KEY e JWKS já estão configuradas. Nenhuma alteração.");
    return;
  }
  if (presentKeys.length) {
    throw new Error(
      "Existe apenas uma das chaves JWT_PRIVATE_KEY/JWKS. " +
        "Verifique no painel do Convex antes de continuar; não sobrescrevi nada.",
    );
  }

  console.log("[Convex] Gerando novo par RSA para este deployment (sem exibir segredos).");
  const keys = generateAuthKeys();
  for (const key of AUTH_KEYS) {
    // O valor vai por stdin, não aparece no histórico do shell.
    convex(["env", "set", key, "--deployment", deployment], { input: keys[key] });
    console.log("[Convex] Variável configurada:", key);
  }
  const after = new Set(convex(listArgs).split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
  const missing = AUTH_KEYS.filter((key) => !after.has(key));
  if (missing.length) throw new Error("Confirme as chaves JWT no painel Convex.");
  console.log("[Convex] Autenticação preparada. Próxima etapa: publicar o frontend no Cloudflare Pages.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error("[Convex]", error instanceof Error ? error.message : "Falha inesperada.");
    process.exitCode = 1;
  }
}
