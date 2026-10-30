/**
 * Verify Barber OS first-client production auth state (read-only).
 * No secret values are printed or written to disk.
 */
import { createPrivateKey, createPublicKey } from "node:crypto";
import { spawnSync } from "node:child_process";

if (!(process.env.CONVEX_DEPLOY_KEY ?? "").startsWith("prod:clever-squid-863|")) {
  throw new Error("Verifier refused: wrong deployment key prefix.");
}
function read(name) {
  const result = spawnSync("bunx", ["convex", "env", "get", "--prod", name], {
    encoding: "utf8", timeout: 120000, maxBuffer: 512 * 1024,
    env: { ...process.env, NO_COLOR: "1" },
  });
  if (result.status !== 0) {
    // Do not show CLI stderr; errors might contain sensitive values.
    return undefined;
  }
  return result.stdout.trim();
}
function equal(name, expected) {
  if (read(name) !== expected) throw new Error(name + " has unexpected value or is missing.");
  console.log("PASS " + name);
}
equal("SITE_URL", "https://barber-os-cliente.pages.dev");
equal("BARBER_AUTH_V2_ENABLED", "true");
equal("BARBER_GOOGLE_AUTH_ENABLED", "false");
equal("BARBER_MVP_GOOGLE_ONLY", "false");
equal("BARBER_AUTH_COMMERCIAL_ENABLED", "false");
equal("BARBER_BILLING_ENFORCED", "false");

const rawPrivate = read("JWT_PRIVATE_KEY");
const rawJwks = read("JWKS");
if (!rawPrivate || !rawJwks) throw new Error("JWT private/public pair missing.");
try {
  const match = /^-----BEGIN PRIVATE KEY-----\s*([A-Za-z0-9+/\s=]+?)\s*-----END PRIVATE KEY-----$/.exec(rawPrivate);
  if (!match) throw new Error("private key is not PKCS8");
  const body = match[1].replace(/\s/g, "");
  const pem = "-----BEGIN PRIVATE KEY-----\n" + (body.match(/.{1,64}/g) ?? []).join("\n") +
    "\n-----END PRIVATE KEY-----\n";
  const pub = createPublicKey(createPrivateKey(pem)).export({format:"jwk"});
  const jwks = JSON.parse(rawJwks);
  if (!Array.isArray(jwks.keys) || jwks.keys.length !== 1 ||
      jwks.keys[0].n !== pub.n || jwks.keys[0].e !== pub.e ||
      jwks.keys[0].use !== "sig" || jwks.keys[0].kty !== "RSA") {
    throw new Error("public JWK mismatch");
  }
} catch {
  throw new Error("JWT pair has invalid format or mismatched public key; values hidden.");
}
console.log("PASS JWT_PRIVATE_KEY/JWKS cryptographic public-key match");

const provider = read("BARBER_EMAIL_PROVIDER") ?? "resend";
const keyName = provider === "brevo" ? "BREVO_API_KEY" : "RESEND_API_KEY";
const fromName = provider === "brevo" ? "BREVO_FROM_EMAIL" : "RESEND_FROM_EMAIL";
const manual = provider === "manual";
const emailConfigured = manual || ((provider === "brevo" || provider === "resend") &&
  !!read(keyName) && !!read(fromName));
console.log(manual
  ? "PENDING: manual verification selected; operator delivery and identity checks require QA"
  : emailConfigured
    ? "PENDING: e-mail provider configured, delivery is NOT verified"
    : "BLOCKED: transactional e-mail provider not configured");
console.log("BLOCKED: commercial onboarding is deliberately disabled");
console.log("PENDING: real e-mail delivery, recovery, backup restore, LGPD acceptance, tenant-isolation tests");
console.log("PASS: production authentication configuration verified without leaking credentials.");
