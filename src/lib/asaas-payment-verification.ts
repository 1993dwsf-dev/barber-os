/** Pure verification of a sandbox Asaas payment response (no PII returned). */
export type AsaasPaymentReview = {
  status: string;
  receivedAmountCents: number;
  expectedAmountCents: number;
  amountMatches: boolean;
  paidStatus: boolean;
  cashRecordedOutsideAsaas: boolean;
  customerOwnershipVerified: false;
  accessGranted: false;
  eligibleForAutomaticActivation: false;
};

function asObject(input: unknown): Record<string, unknown> | null {
  return input !== null && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown> : null;
}

export function reviewSandboxPayment(
  payload: unknown, expectedPaymentId: string, expectedAmountCents: number,
): AsaasPaymentReview {
  const row = asObject(payload);
  if (!row || row.id !== expectedPaymentId ||
      typeof row.status !== "string" || !/^[A-Z_]{3,48}$/.test(row.status) ||
      typeof row.value !== "number" || !Number.isFinite(row.value) ||
      row.value < 0 || row.value > 1_000_000 ||
      !Number.isSafeInteger(expectedAmountCents) || expectedAmountCents < 1) {
    throw new Error("Resposta de cobrança inválida ou pagamento não corresponde ao registro.");
  }
  // Two-decimal BRL representation. Detect extra precision, rather than hide it.
  const cents = Math.round(row.value * 100);
  if (Math.abs(row.value * 100 - cents) > 0.000001) {
    throw new Error("Valor retornado com precisão monetária inesperada.");
  }
  return {
    status: row.status,
    receivedAmountCents: cents,
    expectedAmountCents,
    amountMatches: cents === expectedAmountCents,
    paidStatus: row.status === "RECEIVED" || row.status === "CONFIRMED",
    cashRecordedOutsideAsaas: row.billingType === "RECEIVED_IN_CASH",
    customerOwnershipVerified: false,
    accessGranted: false,
    eligibleForAutomaticActivation: false,
  };
}
