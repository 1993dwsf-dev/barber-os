#!/usr/bin/env bun
/**
 * Guarda-chuva da premissa de isolamento por unidade: toda tabela de dados de
 * uma organização precisa declarar o índice `by_org`.
 *
 * É o que permite a todas as queries/mutations (e a exportação de backup) ler
 * apenas a unidade do chamador usando `withIndex("by_org", ...)` em vez de
 * varrer a tabela inteira e filtrar em memória.
 *
 * Uso: `bun run check:schema` (também roda no CI).
 */

import { readFileSync } from "node:fs";

/** Tabelas globais, sem `organizationId` — não precisam do índice. */
const GLOBAL_TABLES = new Set(["users", "organizations", "rateLimits", "commercialInvites"]);

type Table = { name: string; line: number; hasByOrg: boolean };

const source = readFileSync(new URL("../src/convex/schema.ts", import.meta.url), "utf8");
const lines = source.split("\n");
const tables: Table[] = [];

for (let i = 0; i < lines.length; i++) {
  const match = lines[i]?.match(/^\s*(\w+):\s*defineTable\(/);
  if (!match?.[1]) continue;

  let hasByOrg = false;
  for (let j = i; j < lines.length; j++) {
    const line = lines[j] ?? "";
    if (j > i && /^\s*\w+:\s*defineTable\(/.test(line)) break;
    if (line.includes('.index("by_org"')) hasByOrg = true;
  }
  tables.push({ name: match[1], line: i + 1, hasByOrg });
}

const unitTables = tables.filter((t) => !GLOBAL_TABLES.has(t.name));
const missing = unitTables.filter((t) => !t.hasByOrg);

console.log(
  `tabelas: ${tables.length} · de unidade: ${unitTables.length} · com by_org: ${
    unitTables.length - missing.length
  }`,
);

if (missing.length > 0) {
  console.error(`sem by_org: ${missing.map((t) => `${t.name}@${t.line}`).join(", ")}`);
  process.exit(1);
}

console.log("OK: todas as tabelas de unidade possuem o índice by_org.");
