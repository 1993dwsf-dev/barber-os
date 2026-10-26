/**
 * Asaas sandbox webhook normalization.
 * Incoming provider payloads are untrusted, even after token authentication.
 * Keep only minimal operational IDs; never retain raw payload or PII.
 */
export const SUPPORTED_ASAAS_PAYMENT_EVENTS = new Set([
  "PAYMENT_CREATED",
  "PAYMENT_UPDATED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_REFUNDED",
  "PAYMENT_DELETED",
  "PAYMENT_CHARGEBACK_REQUESTED",
]);

export type AsaasSandboxEvent = {
  eventId: string;
  eventType: string;
  paymentId: string;
  subscriptionId?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

const safeId = (x: unknown): x is string =>
  typeof x === "string" && /^[a-zA-Z0-9_&-]{4,120}$/.test(x);

export function parseAsaasSandboxEvent(payload: unknown):
  | { kind: "recognized"; value: AsaasSandboxEvent }
  | { kind: "ignored" }
  | { kind: "invalid" } {
  const body = asRecord(payload);
  if (!body) return { kind: "invalid" };
  // Unknown event types are acknowledged without storing to prevent queue stalls.
  if (typeof body.event !== "string" || !SUPPORTED_ASAAS_PAYMENT_EVENTS.has(body.event)) {
    return { kind: "ignored" };
  }
  const payment = asRecord(body.payment);
  if (!safeId(body.id) || !payment || !safeId(payment.id)) {
    return { kind: "invalid" };
  }
  // Provider sometimes sends subscription as a string, sometimes null.
  // Refuse malformed values; never use a caller supplied organization ID.
  const subscription = payment.subscription;
  if (subscription !== undefined && subscription !== null && !safeId(subscription)) {
    return { kind: "invalid" };
  }
  return {
    kind: "recognized",
    value: {
      eventId: body.id,
      eventType: body.event,
      paymentId: payment.id,
      ...(typeof subscription === "string" ? { subscriptionId: subscription } : {}),
    },
  };
}

/**
 * Compare SHA-256 digests without early exit on matching positions.
 * Token comparison only runs in Convex server runtime, never in the browser.
 */
export async function matchWebhookSecret(received: string | null, expected: string): Promise<boolean> {
  if (!received || expected.length < 32 || expected.length > 255 ||
      /\s/.test(expected) || received.length > 255) return false;
  const encode = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encode.encode(received)),
    crypto.subtle.digest("SHA-256", encode.encode(expected)),
  ]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let mismatch = received.length ^ expected.length;
  for (let i = 0; i < left.length; i++) mismatch |= left[i] ^ right[i];
  return mismatch === 0;
}
