/**
 * Manual sandbox associations are independent from payment processing.
 * Never enable this flag in a production deployment.
 */
export function sandboxLinkingAllowed() {
  return process.env.BARBER_ASAAS_LINKING_ENABLED === "true" &&
    process.env.BARBER_ASAAS_ENV === "sandbox" &&
    process.env.BARBER_BILLING_ENFORCED !== "true" &&
    process.env.CONVEX_CLOUD_URL?.replace(/\/$/, "") ===
      "https://unique-tortoise-387.convex.cloud";
}
