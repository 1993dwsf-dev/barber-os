/**
 * Barber OS — guarded Brevo email provisioning to isolated Convex Production.
 * Reads approved secrets from GitHub environment; prints no credentials.
 * Does not open commercial access or initiate mail delivery.
 */
import { spawnSync } from "node:child_process";
const key = process.env.CONVEX_DEPLOY_KEY ?? "";
if (!key.startsWith("prod:clever-squid-863|")) {
  throw new Error("Deployment guard failed: only clever-squid-863 is permitted.");
}
const apiKey = process.env.BARBER_FIRST_CLIENT_BREVO_KEY ?? "";
const from = (process.env.BARBER_FIRST_CLIENT_BREVO_FROM ?? "").trim();
if (!apiKey && !from) {
  console.log("NOT CONFIGURED: BREVO API key and approved sender are not connected in GitHub.");
  console.log("Commercial sign-up remains disabled.");
  process.exit(0);
}
if (!apiKey || !from) throw new Error("Both BREVO key and approved sender are required.");
if (!/^[\x20-\x7E]{10,256}$/.test(apiKey) || /[\r\n]/.test(apiKey)) {
  throw new Error("Invalid Brevo API key format (value hidden).");
}
const address = (from.match(/<([^<>]+)>$/)?.[1] ?? from).trim().toLowerCase();
if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address) ||
    /[\r\n]/.test(from) || from.length > 254 ||
    address.endsWith("@resend.dev")) {
  throw new Error("Invalid sender email format (value hidden).");
}
function cli(args, input) {
  const r = spawnSync("bunx", ["convex", ...args], {
    encoding: "utf8", input, env: {...process.env, NO_COLOR:"1"},
    timeout:120000, maxBuffer: 1024*1024,
  });
  if (r.status !== 0) throw new Error("Convex env command failed; output hidden.");
  return r.stdout.trim();
}
const names = new Set(cli(["env", "list", "--prod", "--names-only"]).split(/\r?\n/).map(s=>s.trim()));
function setIfMissing(name, value) {
  if (names.has(name)) {
    // Never silently overwrite an existing provider, sender or API secret.
    if (cli(["env","get","--prod",name]) !== value) {
      throw new Error(name + " already exists with another value; safe guard blocked overwrite.");
    }
    console.log("PRESERVED " + name);
    return;
  }
  cli(["env","set","--prod",name], value + "\n");
  console.log("CREATED " + name);
}
setIfMissing("BREVO_API_KEY", apiKey);
setIfMissing("BREVO_FROM_EMAIL", from);
setIfMissing("BARBER_EMAIL_PROVIDER", "brevo");
if (cli(["env","get","--prod","BARBER_AUTH_COMMERCIAL_ENABLED"]) !== "false") {
  throw new Error("Commercial access flag is not disabled; review before proceeding.");
}
console.log("PASS Brevo parameters stored in isolated Convex Production.");
console.log("PENDING manual provider sender approval and actual Gmail/Outlook delivery QA.");
console.log("Commercial access remains disabled. No email was sent.");
