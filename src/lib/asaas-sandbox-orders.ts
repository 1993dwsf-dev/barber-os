/**
 * Charge issue constraints and comparison for Asaas Sandbox.
 * The production gateway is intentionally unavailable in this module.
 */
export const SANDBOX_ASAAS_GATEWAY = "https://api-sandbox.asaas.com";

export type SandboxOrderSpec = {
  externalReference: string;
  customerId: string;
  priceCents: number;
  billingType: "PIX" | "BOLETO";
  dueDate: string;
  planName: string;
};

export function sandboxOrderIssueEnabled() {
  return process.env.BARBER_ASAAS_ORDER_WRITES === "true" &&
    process.env.BARBER_ASAAS_LOOKUP_ENABLED === "true" &&
    process.env.BARBER_ASAAS_ENV === "sandbox" &&
    process.env.BARBER_BILLING_ENFORCED !== "true" &&
    process.env.CONVEX_CLOUD_URL?.replace(/\/$/, "") ===
      "https://unique-tortoise-387.convex.cloud";
}

export function validCustomerId(value: string): boolean {
  return /^cus_[A-Za-z0-9_]{6,110}$/.test(value);
}

export function isAllowedDueDate(date: string, now: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const timestamp = Date.parse(date + "T00:00:00.000Z");
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) return false;
  const utcToday = Date.UTC(
    new Date(now).getUTCFullYear(),
    new Date(now).getUTCMonth(),
    new Date(now).getUTCDate(),
  );
  return timestamp >= utcToday && timestamp <= utcToday + 45 * 86_400_000;
}

export function createSandboxPaymentBody(spec: SandboxOrderSpec) {
  if (!validCustomerId(spec.customerId) ||
      !/^barber_sbx_[A-Za-z0-9_]{10,100}$/.test(spec.externalReference) ||
      !Number.isSafeInteger(spec.priceCents) || spec.priceCents <= 0 ||
      spec.priceCents > 100000000 ||
      !["PIX", "BOLETO"].includes(spec.billingType) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(spec.dueDate)) {
    throw new Error("Parâmetros de cobrança Sandbox inválidos.");
  }
  return {
    customer: spec.customerId,
    billingType: spec.billingType,
    value: spec.priceCents / 100,
    dueDate: spec.dueDate,
    description: ("Barber OS Sandbox - " + spec.planName).slice(0, 200),
    externalReference: spec.externalReference,
  };
}

function record(input: unknown): Record<string, unknown> | null {
  return typeof input === "object" && input !== null && !Array.isArray(input)
    ? input as Record<string, unknown> : null;
}

/**
 * Require exact provider fields before declaring that this is our charge.
 * Failing closed here prevents linking an arbitrary payment from the same Asaas account.
 */
export function verifyIssuedSandboxPayment(payload: unknown, spec: SandboxOrderSpec): string {
  const data = record(payload);
  if (!data || typeof data.id !== "string" || !/^pay_[A-Za-z0-9_]{5,110}$/.test(data.id) ||
      data.externalReference !== spec.externalReference ||
      data.customer !== spec.customerId ||
      data.billingType !== spec.billingType ||
      data.dueDate !== spec.dueDate ||
      typeof data.value !== "number" || !Number.isFinite(data.value) ||
      Math.abs(data.value * 100 - spec.priceCents) > 0.000001 ||
      data.subscription !== undefined && data.subscription !== null ||
      data.installment !== undefined && data.installment !== null) {
    throw new Error("Cobrança não corresponde ao pedido originado no Barber OS.");
  }
  return data.id;
}

export function parseAsaasReferenceMatches(payload: unknown): unknown[] {
  const data = record(payload);
  if (!data || !Array.isArray(data.data) || data.data.length > 2) {
    throw new Error("Consulta por referência retornou um formato inesperado.");
  }
  return data.data;
}
