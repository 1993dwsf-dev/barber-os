/**
 * Diagnóstico offline para um deployment comercial NOVO.
 * Não lê .env.local e nunca imprime os valores dos segredos.
 * Um PASS não libera operação comercial.
 */
import { evaluateCommercialConfig, type CommercialEnv } from "../src/lib/commercial-preflight";

const names: (keyof CommercialEnv)[] = [
  "CONVEX_SITE_URL", "CONVEX_DEPLOYMENT", "SITE_URL",
  "BARBER_AUTH_COMMERCIAL_ENABLED", "BARBER_BILLING_ENFORCED",
  "BARBER_AUTH_V2_ENABLED", "BARBER_GOOGLE_AUTH_ENABLED", "BARBER_MVP_GOOGLE_ONLY",
  "RESEND_API_KEY", "RESEND_FROM_EMAIL",
  "BARBER_EMAIL_PROVIDER", "BARBER_MANUAL_INBOX_SECRET", "BREVO_API_KEY", "BREVO_FROM_EMAIL",
  "JWT_PRIVATE_KEY", "JWKS",
];
const env = Object.fromEntries(names.map(name => [name, process.env[name]])) as CommercialEnv;
const result = evaluateCommercialConfig(env);

console.log("Barber OS — pré-checagem de configuração comercial (sem valores privados)");
for (const check of result.checks) {
  console.log((check.passed ? "PASS" : "FAIL") + "  " + check.id + ": " + check.description);
}
console.log(
  result.configurationReady
    ? "Configuração básica aprovada. NÃO equivale à autorização para vender."
    : "Configuração básica bloqueada. Não publicar nem habilitar clientes.",
);
console.log("Ainda requer verificação independente:");
for (const task of result.pendingManualVerification) console.log("- " + task);
console.log(result.warning);
if (!result.configurationReady) process.exitCode = 1;
