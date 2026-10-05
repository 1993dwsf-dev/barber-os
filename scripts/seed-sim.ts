/**
 * Simulador local do seed de demonstração.
 *
 * Executa `seedDemoData` contra um `ctx.db` falso em memória e contabiliza as
 * métricas cobridas pelos limites de transação do Convex:
 *   - Documents written (limite 16.000)
 *   - Documents scanned (limite 32.000)
 *   - Index ranges read (limite 4.096) = nº de chamadas db.get + db.query
 *   - Data read / Data written (limite 16 MiB)
 *
 * Ferramenta temporária de análise — não faz parte do app.
 */
import schema from "../src/convex/schema";
import { seedDemoData } from "../src/convex/seed";
import { defaultSettings } from "../src/convex/orgs";

type Row = { _id: string; [k: string]: unknown };

const LIMITS = {
  documentsWritten: 16_000,
  documentsScanned: 32_000,
  indexRangesRead: 4_096,
  dataReadBytes: 16 * 1024 * 1024,
  dataWrittenBytes: 16 * 1024 * 1024,
};

const stats = {
  documentsWritten: 0,
  documentsScanned: 0,
  indexRangesRead: 0,
  dataReadBytes: 0,
  dataWrittenBytes: 0,
  ioOps: 0,
  writesByTable: new Map<string, number>(),
  rangesByIndex: new Map<string, number>(),
  scannedByIndex: new Map<string, number>(),
  readsByTable: new Map<string, number>(),
};

const bump = (m: Map<string, number>, k: string, by = 1) => m.set(k, (m.get(k) ?? 0) + by);

const store = new Map<string, Row>();
const tableOf = new Map<string, string>();
let seq = 0;

const byteSize = (v: unknown): number => JSON.stringify(v ?? null)?.length ?? 0;

/* ------------------------------ filtros ------------------------------ */

type Pred = (row: Row) => boolean;

const makePredicate = (fn: (q: any) => unknown): Pred => {
  const f = fn;
  const api: any = {
    field: (name: string) => name,
    eq: (a: unknown, b: unknown) => () => (a === b ? true : a !== undefined && typeof a === "object" && b !== undefined && typeof b === "object" ? JSON.stringify(a) === JSON.stringify(b) : false),
    neq: (a: unknown, b: unknown) => () => a !== b,
    gt: (a: unknown, b: unknown) => () => (a as number) > (b as number),
    gte: (a: unknown, b: unknown) => () => (a as number) >= (b as number),
    lt: (a: unknown, b: unknown) => () => (a as number) < (b as number),
    lte: (a: unknown, b: unknown) => () => (a as number) <= (b as number),
    and: (...args: any[]) => () => args.every((a) => a()),
    or: (...args: any[]) => () => args.some((a) => a()),
    not: (arg: any) => () => !arg(),
  };
  return f(api) as Pred;
};

/* ------------------------------ query ------------------------------ */

const cmp = (a: unknown, b: unknown): number => {
  if (a === b) return 0;
  if (a === undefined) return -1;
  if (b === undefined) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : 1;
};

const indexFields = (table: string, index: string): string[] => {
  const t = (schema as any).tables[table];
  const idx = t?.indexes?.[index];
  if (!idx) throw new Error(`índice desconhecido ${table}.${index}`);
  return idx.fields as string[];
};

const scan = (table: string, index: string, pred: Pred | null, take: "all" | "one" | number) => {
  const fields = indexFields(table, index);
  const key = `${table}.${index}`;
  stats.indexRangesRead += 1;
  stats.ioOps += 1;
  const rows: Row[] = [];
  for (const row of store.values()) {
    if (tableOf.get(row._id) !== table) continue;
    rows.push(row);
  }
  rows.sort((x, y) => {
    for (const field of fields) {
      const c = cmp(x[field], y[field]);
      if (c !== 0) return c;
    }
    return 0;
  });
  const out: Row[] = [];
  const limit = take === "one" ? 1 : take === "all" ? Infinity : take;
  for (const row of rows) {
    if (out.length >= limit) break;
    stats.documentsScanned += 1;
    bump(stats.scannedByIndex, key);
    stats.dataReadBytes += byteSize(row);
    if (!pred || pred(row)) out.push(row);
  }
  bump(stats.rangesByIndex, key);
  return out;
};

const makeQuery = (table: string) => ({
  withIndex(index: string, builder: (q: any) => unknown) {
    const conds: Array<[string, unknown, (a: unknown, b: unknown) => boolean]> = [];
    const q: any = {
      eq: (field: string, value: unknown) => (conds.push([field, value, (a, b) => a === b]), q),
      gt: (field: string, value: unknown) => (conds.push([field, value, (a, b) => cmp(a, b) > 0]), q),
      gte: (field: string, value: unknown) => (conds.push([field, value, (a, b) => cmp(a, b) >= 0]), q),
      lt: (field: string, value: unknown) => (conds.push([field, value, (a, b) => cmp(a, b) < 0]), q),
      lte: (field: string, value: unknown) => (conds.push([field, value, (a, b) => cmp(a, b) <= 0]), q),
    };
    builder(q);
    const rangePred: Pred = (row) => conds.every(([f, v, cmpFn]) => cmpFn(row[f], v));
    let filterPred: Pred | null = null;
    const self: any = {
      filter(fn: (q: any) => unknown) {
        filterPred = makePredicate(fn);
        return self;
      },
      order() {
        return self;
      },
      async first() {
        bump(stats.readsByTable, `${table}.first`);
        const rows = scan(table, index, filterPred, "one");
        return rows[0] ?? null;
      },
      async unique() {
        return self.first();
      },
      async take(n: number) {
        bump(stats.readsByTable, `${table}.take`);
        return scan(table, index, filterPred, n);
      },
      async collect() {
        bump(stats.readsByTable, `${table}.collect`);
        return scan(table, index, filterPred, "all");
      },
    };
    return self;
  },
});

/* ------------------------------ db ------------------------------ */

const db: any = {
  insert: async (table: string, doc: Record<string, unknown>) => {
    stats.documentsWritten += 1;
    stats.dataWrittenBytes += byteSize(doc);
    stats.ioOps += 1;
    bump(stats.writesByTable, table);
    const id = `${table}_${++seq}_${Math.random().toString(36).slice(2, 10)}`;
    store.set(id, { _id: id, ...doc });
    tableOf.set(id, table);
    return id;
  },
  patch: async (id: string, patch: Record<string, unknown>) => {
    const row = store.get(id);
    if (!row) throw new Error(`patch em id inexistente ${id}`);
    stats.documentsWritten += 1;
    stats.dataWrittenBytes += byteSize(patch);
    stats.ioOps += 1;
    bump(stats.writesByTable, `${tableOf.get(id)}.patch`);
    Object.assign(row, patch);
  },
  replace: async (id: string, doc: Record<string, unknown>) => {
    await db.patch(id, doc);
  },
  delete: async (id: string) => {
    const t = tableOf.get(id);
    store.delete(id);
    tableOf.delete(id);
    stats.ioOps += 1;
    bump(stats.writesByTable, `${t}.delete`);
  },
  get: async (id: string) => {
    stats.indexRangesRead += 1;
    stats.documentsScanned += 1;
    stats.ioOps += 1;
    bump(stats.readsByTable, `${tableOf.get(id) ?? "?"}.get`);
    const row = store.get(id);
    if (row) stats.dataReadBytes += byteSize(row);
    return row ?? null;
  },
  query: (table: string) => {
    stats.ioOps += 0;
    return makeQuery(table);
  },
};

/* ------------------------------ execução ------------------------------ */

const orgId = "organizations_0_demoorg";
const userId = "users_0_demo";
store.set(orgId, {
  _id: orgId,
  name: " Navalha de Ouro",
  slug: "navalha-de-ouro",
  ownerId: userId,
  salesCount: 0,
  isDemo: true,
  plan: "demo",
  createdAt: Date.now(),
  settings: defaultSettings(),
} as unknown as Row);
tableOf.set(orgId, "organizations");

const t0 = performance.now();
await seedDemoData({ db } as any, orgId as any, userId as any);
const elapsed = performance.now() - t0;

/* ------------------------------ relatório ------------------------------ */

const pct = (n: number, limit: number) => `${((n / limit) * 100).toFixed(1)}%`;
const top = (m: Map<string, number>, n = 12) =>
  [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

const row = (label: string, value: number, limit: number, unit = "") => {
  const ok = value <= limit ? "OK " : "!! ";
  console.log(
    `${ok}${label.padEnd(24)} ${String(value).padStart(8)}${unit} / ${limit} (${pct(value, limit)})`,
  );
};

console.log(`\n== seedDemoData: ${store.size} documentos ==`);
console.log(`tempo simulado: ${elapsed.toFixed(0)} ms\n`);
row("documents written", stats.documentsWritten, LIMITS.documentsWritten);
row("documents scanned", stats.documentsScanned, LIMITS.documentsScanned);
row("index ranges read", stats.indexRangesRead, LIMITS.indexRangesRead);
row("data written (MiB)", +(stats.dataWrittenBytes / 1024 / 1024).toFixed(2), LIMITS.dataWrittenBytes / 1024 / 1024);
row("data read (MiB)", +(stats.dataReadBytes / 1024 / 1024).toFixed(2), LIMITS.dataReadBytes / 1024 / 1024);
row("operações de IO", stats.ioOps, 1000);

console.log("\n-- escritas por tabela --");
for (const [t, c] of top(stats.writesByTable)) console.log(`  ${t.padEnd(28)} ${c}`);
console.log("\n-- documents scanned por índice --");
for (const [t, c] of top(stats.scannedByIndex)) console.log(`  ${t.padEnd(34)} ${c}`);
console.log("\n-- ranges lidos por índice --");
for (const [t, c] of top(stats.rangesByIndex)) console.log(`  ${t.padEnd(34)} ${c}`);
console.log("\n-- leituras por tabela --");
for (const [t, c] of top(stats.readsByTable)) console.log(`  ${t.padEnd(34)} ${c}`);

const failures = (Object.keys(LIMITS) as Array<keyof typeof LIMITS>).filter(
  (k) => stats[k] > LIMITS[k],
);
if (stats.ioOps > 1000) failures.push("ioOps");
console.log(failures.length ? `\nLIMITE EXCEDIDO: ${failures.join(", ")}` : "\nTodos os limites respeitados.");