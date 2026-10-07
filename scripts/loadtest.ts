#!/usr/bin/env bun
/**
 * Teste de carga das funções Convex (foco em consultas).
 *
 * Por padrão só dispara **queries** (leitura). Para testar mutações é preciso
 * passar `--allow-mutation`, e mesmo assim use um ambiente de teste: mutação em
 * produção grava dados reais.
 *
 * Uso:
 *   CONVEX_URL=https://<deployment>.convex.cloud \
 *   CONVEX_TOKEN=<jwt> \
 *   bun run loadtest --path dashboard:overview --args '{"organizationId":"<id>"}' \
 *     --duration 30 --concurrency 10
 *
 * Como obter o token: entre no app, abra o DevTools → Application →
 * Local Storage e copie o valor da chave
 * `__convexAuthJWT_https://<deployment>.convex.cloud` (ela é o JWT da sessão).
 * O token expira; para cargas longas, refaça o login.
 *
 * Saída: total de requisições, RPS, taxa de erro e latências p50/p90/p95/p99.
 * Sai com código 1 se a taxa de erro passar de `--max-error-rate` (padrão 2%).
 */

type Options = {
  url: string;
  token: string;
  path: string;
  args: Record<string, unknown>;
  durationMs: number;
  concurrency: number;
  maxErrorRate: number;
  allowMutation: boolean;
  dryRun: boolean;
  timeoutMs: number;
};

const HELP = `Teste de carga do Convex

Flags:
  --path <modulo:funcao>      função a executar (obrigatório)
  --args '<json>'             argumentos da função (padrão: {})
  --duration <segundos>       duração do teste (padrão: 15)
  --concurrency <n>           requisições simultâneas (padrão: 5)
  --max-error-rate <0..1>     falha o teste acima disso (padrão: 0.02)
  --timeout-ms <n>            timeout por requisição (padrão: 15000)
  --allow-mutation            permite executar mutation (padrão: só query)
  --dry-run                   valida a config e não envia requisições
  --help                      mostra esta ajuda

Ambiente:
  CONVEX_URL    URL do deployment (ou --url)
  CONVEX_TOKEN  JWT da sessão (ou --token)
`;

function fail(message: string): never {
  console.error(`erro: ${message}`);
  console.error(`\n${HELP}`);
  process.exit(2);
}

function readFlag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) fail(`--${name} exige um valor`);
  return value;
}

function positiveNumber(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) fail(`--${name} precisa ser um número positivo`);
  return value;
}

function parseOptions(argv: string[]): Options {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
    process.exit(0);
  }

  const allowMutation = argv.includes("--allow-mutation");
  const dryRun = argv.includes("--dry-run");

  const path = readFlag(argv, "path") ?? fail("--path é obrigatório");
  const rawUrl = (readFlag(argv, "url") ?? process.env.CONVEX_URL ?? "").replace(/\/+$/, "");
  if (!rawUrl && !dryRun) fail("informe a URL do deployment em --url ou CONVEX_URL");
  const url = rawUrl || "https://dry-run.convex.cloud";

  const token = readFlag(argv, "token") ?? process.env.CONVEX_TOKEN ?? "";
  if (!token && !dryRun) fail("informe o token da sessão em --token ou CONVEX_TOKEN");

  if (!path.includes(":")) fail("use o formato modulo:funcao em --path");
  if (!allowMutation && !dryRun) {
    // heurística simples: mutações costumam ter nomes de ação
    const mutatingNames = /(create|update|add|set|delete|remove|complete|renew|adjust|redeem|archive|buy|record|link|generate|close|open|enter|seed|reset|clear)/i;
    if (mutatingNames.test(path.split(":")[1] ?? "")) {
      fail(`"${path}" parece uma mutation; use --allow-mutation se for intencional (cuidado: grava dados)`);
    }
  }

  const rawArgs = readFlag(argv, "args") ?? "{}";
  let args: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawArgs);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      fail("--args precisa ser um objeto JSON, ex.: '{\"organizationId\":\"abc\"}'");
    }
    args = parsed as Record<string, unknown>;
  } catch {
    fail("--args não é um JSON válido");
  }

  return {
    url,
    token,
    path,
    args,
    durationMs: positiveNumber(readFlag(argv, "duration"), 15, "duration") * 1000,
    concurrency: Math.floor(positiveNumber(readFlag(argv, "concurrency"), 5, "concurrency")),
    maxErrorRate: positiveNumber(readFlag(argv, "max-error-rate"), 0.02, "max-error-rate"),
    allowMutation,
    dryRun,
    timeoutMs: positiveNumber(readFlag(argv, "timeout-ms"), 15_000, "timeout-ms"),
  };
}

type Stats = {
  ok: number;
  errors: number;
  latencies: number[];
  errorMessages: Map<string, number>;
};

async function callOnce(options: Options, stats: Stats): Promise<void> {
  const endpoint = options.allowMutation ? "mutation" : "query";
  const started = performance.now();
  try {
    const response = await fetch(`${options.url}/api/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.token}`,
      },
      body: JSON.stringify({ path: options.path, args: options.args, format: "json" }),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    const text = await response.text();
    const latency = performance.now() - started;
    stats.latencies.push(latency);
    if (!response.ok) {
      stats.errors += 1;
      const key = `HTTP ${response.status}: ${text.slice(0, 160)}`;
      stats.errorMessages.set(key, (stats.errorMessages.get(key) ?? 0) + 1);
      return;
    }
    if (text.includes(`"status":"error"`)) {
      stats.errors += 1;
      const key = `erro da função: ${text.slice(0, 160)}`;
      stats.errorMessages.set(key, (stats.errorMessages.get(key) ?? 0) + 1);
      return;
    }
    stats.ok += 1;
  } catch (error) {
    const latency = performance.now() - started;
    stats.latencies.push(latency);
    stats.errors += 1;
    const key = error instanceof Error ? error.message : String(error);
    stats.errorMessages.set(key, (stats.errorMessages.get(key) ?? 0) + 1);
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index]!;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));

  console.log("Teste de carga — BarberFlow OS");
  console.log(`  deployment:   ${options.url}`);
  console.log(`  função:       ${options.path} (${options.allowMutation ? "mutation" : "query"})`);
  console.log(`  argumentos:   ${JSON.stringify(options.args)}`);
  console.log(`  duração:      ${options.durationMs / 1000}s`);
  console.log(`  concorrência: ${options.concurrency}`);
  console.log(`  limite erro:  ${(options.maxErrorRate * 100).toFixed(1)}%\n`);

  if (options.dryRun) {
    console.log("--dry-run: configuração validada, nenhuma requisição enviada.");
    return;
  }

  const stats: Stats = { ok: 0, errors: 0, latencies: [], errorMessages: new Map() };
  const deadline = Date.now() + options.durationMs;

  const workers = Array.from({ length: options.concurrency }, async () => {
    while (Date.now() < deadline) {
      await callOnce(options, stats);
    }
  });

  await Promise.all(workers);

  const total = stats.ok + stats.errors;
  const seconds = options.durationMs / 1000;
  const errorRate = total === 0 ? 1 : stats.errors / total;

  console.log(`Requisições: ${total} (${(total / seconds).toFixed(1)}/s)`);
  console.log(`Sucesso:     ${stats.ok}`);
  console.log(`Erros:       ${stats.errors} (${(errorRate * 100).toFixed(2)}%)`);
  console.log(
    `Latência ms: min ${percentile(stats.latencies, 0).toFixed(0)} · p50 ${percentile(
      stats.latencies,
      50,
    ).toFixed(0)} · p90 ${percentile(stats.latencies, 90).toFixed(0)} · p95 ${percentile(
      stats.latencies,
      95,
    ).toFixed(0)} · p99 ${percentile(stats.latencies, 99).toFixed(0)}`,
  );

  if (stats.errorMessages.size > 0) {
    console.log("\nPrincipais erros:");
    for (const [message, count] of [...stats.errorMessages].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
      console.log(`  ${count}x ${message}`);
    }
  }

  if (total === 0) {
    console.error("\nNenhuma requisição completou; verifique URL, token e rede.");
    process.exit(1);
  }
  if (errorRate > options.maxErrorRate) {
    console.error(`\nFALHOU: taxa de erro ${(errorRate * 100).toFixed(2)}% acima do limite.`);
    process.exit(1);
  }
  console.log("\nOK: dentro do limite de erro configurado.");
}

await main();
