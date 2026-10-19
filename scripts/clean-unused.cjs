'use strict';
const fs = require('fs');
const path = require('path');

function removeLinesContaining(p, pred) {
  const txt = fs.readFileSync(p, 'utf8');
  const lines = txt.split('\n');
  const out = [];
  let changed = false;
  for (const line of lines) {
    if (pred(line)) {
      changed = true;
      continue;
    }
    out.push(line);
  }
  if (!changed) return false;
  fs.writeFileSync(p, out.join('\n'));
  console.log('cleaned', p);
  return true;
}

function removeBlockFrom(p, fromPred, endPred) {
  const txt = fs.readFileSync(p, 'utf8');
  const lines = txt.split('\n');
  const out = [];
  let inBlock = false;
  let changed = false;
  for (const line of lines) {
    if (!inBlock && fromPred(line)) {
      inBlock = true;
      changed = true;
      continue;
    }
    if (inBlock) {
      if (endPred(line)) {
        inBlock = false;
        continue;
      }
      continue;
    }
    out.push(line);
  }
  if (!changed) return false;
  fs.writeFileSync(p, out.join('\n'));
  console.log('cleaned block in', p);
  return true;
}

let any = false;

// src/convex/barbers.ts:3:15  error  'Id' is defined but never used
any = removeLinesContaining('src/convex/barbers.ts', (l) => /Id/.test(l) && /import/.test(l)) || any;

// src/convex/dashboard.ts:120:11  error  'commissionsMonth' is assigned but never used
any = removeLinesContaining('src/convex/dashboard.ts', (l) => /commissionsMonth/.test(l)) || any;

// src/convex/lib.ts:4:10  error  'APP_ROLES' is defined but never used
any = removeLinesContaining('src/convex/lib.ts', (l) => /APP_ROLES/.test(l)) || any;

// src/convex/sales.ts:408:11  error  'commissionTotal' is assigned but never used
any = removeLinesContaining('src/convex/sales.ts', (l) => /commissionTotal/.test(l)) || any;

// src/pages/Caixa.tsx:65:9  error  'addMovement' is assigned but never used
any = removeLinesContaining('src/pages/Caixa.tsx', (l) => /addMovement/.test(l)) || any;

// src/pages/ClienteDetalhe.tsx:18:10  error  'Link' is defined but never used
any = removeLinesContaining('src/pages/ClienteDetalhe.tsx', (l) => /import.*Link/.test(l)) || any;

// src/pages/Clientes.tsx:2:15  error  'Id' is defined but never used
any = removeLinesContaining('src/pages/Clientes.tsx', (l) => /import.*Id/.test(l)) || any;

// src/pages/Configuracoes.tsx:46:9  error  'members' is assigned but never used
any = removeLinesContaining('src/pages/Configuracoes.tsx', (l) => /members = useOrganizationMembers/.test(l)) || any;

// src/pages/Pacotes.tsx:38:10  error  'todayISO' is defined but never used
any = removeLinesContaining('src/pages/Pacotes.tsx', (l) => /todayISO/.test(l)) || any;

// src/pages/Pacotes.tsx:41:6   error  'PayLine' is defined but never used
any = removeBlockFrom('src/pages/Pacotes.tsx', (l) => /const PayLine =/.test(l), (l) => /\);/.test(l) && !/mean/.test(l)) || any;

// src/pages/Pacotes.tsx:44:27  error  'org' is assigned but never used
any = removeLinesContaining('src/pages/Pacotes.tsx', (l) => /= useOrganization\s*\(/.test(l)) || any;

// tests/backendrules.test.ts:35:7   error  'today' is assigned but never used
any = removeLinesContaining('tests/backendrules.test.ts', (l) => /const today =/.test(l)) || any;

// tests/backendrules.test.ts:149:10  error  'messageOf' is defined but never used
any = removeBlockFrom('tests/backendrules.test.ts', (l) => /^function messageOf\(/.test(l), (l) => /^}\s*;/.test(l)) || any;

if (!any) {
  console.log('No targeted unused lines were found/removed.');
  process.exit(1);
}
console.log('Remaining cleanup still required by hand: seed-sim.ts, carousel.tsx, sidebar.tsx, use-mobile.ts');
