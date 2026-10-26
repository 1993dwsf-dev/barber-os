/**
 * Agrupamento visual dos últimos eventos Asaas por cobrança.
 * Mantém cada webhook intacto na inbox transacional e na trilha histórica.
 * Não representa reconciliação bancária nem ativação de assinatura.
 */
export type SandboxPaymentEvent = {
  id: string;
  paymentId: string;
  eventId: string;
  eventType: string;
  receivedAt: number;
};

export type SandboxPaymentGroup<T extends SandboxPaymentEvent> = {
  paymentId: string;
  latest: T;
  history: T[];
};

export function groupSandboxPaymentEvents<T extends SandboxPaymentEvent>(
  events: readonly T[],
): SandboxPaymentGroup<T>[] {
  const byPayment = new Map<string, T[]>();
  for (const event of events) {
    const previous = byPayment.get(event.paymentId);
    if (previous) {
      previous.push(event);
    } else {
      byPayment.set(event.paymentId, [event]);
    }
  }
  return [...byPayment.entries()].map(([paymentId, items]) => {
    // Timestamp desc; ID as deterministic tie breaker for events in same millisecond.
    const history = [...items].sort((a, b) =>
      b.receivedAt - a.receivedAt || b.eventId.localeCompare(a.eventId));
    return { paymentId, latest: history[0], history };
  }).sort((a, b) =>
    b.latest.receivedAt - a.latest.receivedAt ||
    b.latest.eventId.localeCompare(a.latest.eventId));
}

export const SANDBOX_EVENT_LABELS: Record<string, string> = {
  PAYMENT_CREATED: "Cobrança criada",
  PAYMENT_UPDATED: "Cobrança atualizada",
  PAYMENT_CONFIRMED: "Pagamento confirmado",
  PAYMENT_RECEIVED: "Pagamento recebido",
  PAYMENT_OVERDUE: "Pagamento vencido",
  PAYMENT_REFUNDED: "Pagamento estornado",
  PAYMENT_DELETED: "Cobrança excluída",
  PAYMENT_CHARGEBACK_REQUESTED: "Contestação solicitada",
};
