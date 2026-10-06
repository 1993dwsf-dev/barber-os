import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/convex/schema.ts', import.meta.url), 'utf8');
const m = src.match(/export default schema/);
console.log(m ? 'has export default schema' : 'no export default schema');
console.log('has defineSchema call:', src.includes('defineSchema('));
