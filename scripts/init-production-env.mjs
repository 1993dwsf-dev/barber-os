/**
 * Barber OS first-client production bootstrap. Idempotent, no key rotation.
 * Requires a deploy key scoped to prod:clever-squid-863 with env write permissions.
 */
import { generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';

if (!(process.env.CONVEX_DEPLOY_KEY || '').startsWith('prod:clever-squid-863|')) {
  throw new Error('Deployment incorreto: abortado antes de qualquer alteração.');
}
function convex(args, input) {
  const result = spawnSync('bunx', ['convex', ...args], {
    input, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1' }, timeout: 120_000,
  });
  if (result.status !== 0) {
    // Output may contain secrets. Do not print stderr or stdout.
    const diagnostic = (result.stderr || '').toLowerCase();
    const reason = /permission|forbidden|unauthori[sz]ed|access denied|not allowed|403|401/.test(diagnostic)
      ? 'PERMISSION_DENIED'
      : /unknown option|unknown command|invalid argument|unrecognized/.test(diagnostic)
        ? 'CLI_ARGUMENT_REJECTED'
        : 'CLI_ERROR_UNCLASSIFIED';
    throw new Error('Convex ' + args.slice(0, 3).join(' ') + ' falhou: ' + reason + ' (sem exibir detalhes sensíveis).');
  }
  return result.stdout || '';
}
function names() {
  return new Set(convex(['env', 'list', '--prod', '--names-only'])
    .split(/\r?\n/).map(s => s.trim()).filter(s => /^[A-Z][A-Z0-9_]*$/.test(s)));
}
const old = names();
const settings = [
  ['SITE_URL', 'https://barber-os-cliente.pages.dev'],
  ['BARBER_AUTH_V2_ENABLED', 'true'],
  ['BARBER_GOOGLE_AUTH_ENABLED', 'false'],
  ['BARBER_MVP_GOOGLE_ONLY', 'false'],
  ['BARBER_AUTH_COMMERCIAL_ENABLED', 'false'],
  ['BARBER_BILLING_ENFORCED', 'false'],
];
for (const [name, value] of settings) {
  if (old.has(name)) console.log('Preservado: ' + name);
  else {
    convex(['env', 'set', '--prod', name], value + '\n');
    console.log('Criado: ' + name);
  }
}
const hasPrivate = old.has('JWT_PRIVATE_KEY');
const hasJwks = old.has('JWKS');
if (hasPrivate !== hasJwks) {
  throw new Error('Par JWT incompleto; não gerar novas chaves para evitar invalidar sessões.');
}
if (!hasPrivate) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 0x10001 });
  const pkcs8 = privateKey.export({ type: 'pkcs8', format: 'pem' }).trimEnd().replace(/\n/g, ' ');
  const jwks = JSON.stringify({ keys: [{ use: 'sig', ...publicKey.export({ format: 'jwk' }) }] });
  convex(['env', 'set', '--prod', 'JWT_PRIVATE_KEY'], pkcs8 + '\n');
  convex(['env', 'set', '--prod', 'JWKS'], jwks + '\n');
  console.log('Criado: par JWT_PRIVATE_KEY/JWKS (valores ocultos)');
} else console.log('Preservado: par JWT_PRIVATE_KEY/JWKS');
const after = names();
for (const name of [...settings.map(s => s[0]), 'JWT_PRIVATE_KEY', 'JWKS']) {
  if (!after.has(name)) throw new Error('Verificação falhou: ' + name + ' não consta no Convex Production.');
}
console.log('Bootstrap concluído. Cadastro comercial permanece bloqueado.');
