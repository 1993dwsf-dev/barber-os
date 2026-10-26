/**
 * Private-only Asaas Sandbox lookup gates.
 * Reused by the admin query and server action to prevent inconsistent
 * enabled/disabled states. Never return keys or their prefixes.
 */
export function sandboxLookupChecks() {
  const key = process.env.BARBER_ASAAS_API_KEY;
  return {
    sandboxSelected: process.env.BARBER_ASAAS_ENV === "sandbox",
    lookupEnabledFlag: process.env.BARBER_ASAAS_LOOKUP_ENABLED === "true",
    billingSafelyDisabled: process.env.BARBER_BILLING_ENFORCED !== "true",
    developmentDeployment: process.env.CONVEX_CLOUD_URL?.replace(/\/$/, "") ===
      "https://unique-tortoise-387.convex.cloud",
    apiKeyConfigured: Boolean(key?.trim()),
    apiKeyValidFormat: Boolean(key && key.trim().length >= 20 && !/\s/.test(key.trim())),
  };
}

export function sandboxLookupAllowed() {
  return Object.values(sandboxLookupChecks()).every(Boolean);
}
