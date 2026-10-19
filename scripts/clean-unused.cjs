'use strict';
const fs = require('fs');
const path = require('path');

function dropExact(p, target) {
  const txt = fs.readFileSync(p, 'utf8');
  if (!txt.includes(target)) return false;
  fs.writeFileSync(p, txt.replace(target, ''));
  console.log('cleaned exact in', p);
  return true;
}

function dropLinesContaining(p, pred) {
  const txt = fs.readFileSync(p, 'utf8');
  const lines = txt.split('\n');
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    if (pred(lines[i])) {
      lines.splice(i, 1);
      i--;
      changed = true;
    }
  }
  if (!changed) return false;
  fs.writeFileSync(p, lines.join('\n'));
  console.log('cleaned lines in', p);
  return true;
}

let any = false;

// leftover return line ESLint flags as parse error
any = dropExact('tests/backendrules.test.ts',
  '/** Resolve o HttpError lançado pelas funções (bad()/requireX) via Bun? Não —\n' +
  ' * via Convex: erros de função chegam como ConvexError genérico no convex-test. */\n' +
  '  return err instanceof Error ? err.message : String(err);\n}') || any;

any = dropLinesContaining('tests/backendrules.test.ts', (l) => /const today =/.test(l)) || any;
any = dropLinesContaining('src/convex/barbers.ts', (l) => /Id/.test(l) && /import/.test(l)) || any;
any = dropLinesContaining('src/convex/dashboard.ts', (l) => /commissionsMonth/.test(l)) || any;
any = dropLinesContaining('src/convex/lib.ts', (l) => /APP_ROLES/.test(l)) || any;
any = dropLinesContaining('src/convex/sales.ts', (l) => /commissionTotal/.test(l)) || any;
any = dropLinesContaining('src/pages/Caixa.tsx', (l) => /addMovement/.test(l)) || any;
any = dropLinesContaining('src/pages/ClienteDetalhe.tsx', (l) => /import.*Link/.test(l)) || any;
any = dropLinesContaining('src/pages/Clientes.tsx', (l) => /import.*Id/.test(l)) || any;
any = dropLinesContaining('src/pages/Configuracoes.tsx', (l) => /members = useOrganizationMembers/.test(l)) || any;
any = dropLinesContaining('src/pages/Pacotes.tsx', (l) => /todayISO/.test(l) || /type PayLine =/.test(l) || /= useOrganization\s*\(/.test(l)) || any;

if (!any) {
  console.log('No targeted unused lines were found/removed.');
  process.exit(1);
}
console.log('Remaining cleanup still required by hand: seed-sim.ts, carousel.tsx, sidebar.tsx, use-mobile.ts');
