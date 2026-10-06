import { readFileSync, writeFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/convex/schema.ts', import.meta.url), 'utf8');
const lines = src.split('\n');
const tables: Array<{ name: string; line: number }> = [];
let cur: { name?: string; line?: number } = {};
for (let i = 0; i < lines.length; i++) {
  const ln = lines[i];
  const nameMatch = ln.match(/^\s*(\w+):\s*defineTable\(/);
  if (nameMatch) {
    if (cur.name) tables.push(cur as any);
    cur = { name: nameMatch[1], line: i + 1 };
  }
  if (ln.includes('.index("by_org"') || ln.includes('}).index("by_org"')) {
    cur.byOrg = (cur.byOrg ?? 0) + 1;
  }
  if (ln.includes('}),\n') && cur.name) {
    tables.push(cur as any);
    cur = {};
  }
}
if (cur.name) tables.push(cur as any);
const missing = tables.filter((t) => !t.byOrg);
console.log('total tables:', tables.length);
console.log('tables WITH by_org:', tables.filter((t) => t.byOrg).length);
console.log('missing by_org:', missing.map((t) => `${t.name}@${t.line}`).join(', ') || 'none');
