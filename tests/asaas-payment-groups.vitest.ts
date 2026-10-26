import { describe, expect, test } from "vitest";
import {
  groupSandboxPaymentEvents,
  type SandboxPaymentEvent,
} from "../src/lib/asaas-payment-groups";

function event(
  paymentId: string, eventType: string, receivedAt: number, eventId: string,
): SandboxPaymentEvent {
  return {
    id: `inbox_${eventId}`,
    eventId,
    paymentId,
    eventType,
    receivedAt,
  };
}

describe("visão de uma linha por cobrança Asaas", () => {
  test("substitui evento visual de criação por recebimento, sem excluir histórico", () => {
    const created = event("pay_01", "PAYMENT_CREATED", 100, "evt_01");
    const received = event("pay_01", "PAYMENT_RECEIVED", 300, "evt_02");
    const groups = groupSandboxPaymentEvents([created, received]);
    expect(groups).toHaveLength(1);
    expect(groups[0].latest.eventType).toBe("PAYMENT_RECEIVED");
    expect(groups[0].history.map(e => e.eventType)).toEqual([
      "PAYMENT_RECEIVED", "PAYMENT_CREATED",
    ]);
    expect(groups[0].latest.id).toBe(received.id);
    // Não altera o array nem os objetos usados pelo Convex React.
    expect(created.eventType).toBe("PAYMENT_CREATED");
  });

  test("agrupa cobranças independentes e ordena pela última movimentação", () => {
    const groups = groupSandboxPaymentEvents([
      event("pay_A", "PAYMENT_CREATED", 100, "evt_01"),
      event("pay_B", "PAYMENT_RECEIVED", 800, "evt_02"),
      event("pay_A", "PAYMENT_RECEIVED", 500, "evt_03"),
      event("pay_C", "PAYMENT_CREATED", 200, "evt_04"),
    ]);
    expect(groups.map(x => x.paymentId)).toEqual(["pay_B", "pay_A", "pay_C"]);
    expect(groups[1].history).toHaveLength(2);
    expect(groups[0].history).toHaveLength(1);
  });

  test("se eventos chegarem em ordem diferente, usa o horário mais recente", () => {
    const groups = groupSandboxPaymentEvents([
      event("pay_01", "PAYMENT_RECEIVED", 300, "evt_02"),
      event("pay_01", "PAYMENT_CREATED", 100, "evt_01"),
    ]);
    expect(groups[0].latest.eventType).toBe("PAYMENT_RECEIVED");
  });

  test("empate de horário é determinístico e não remove eventos", () => {
    const entries = [
      event("pay_01", "PAYMENT_CREATED", 100, "evt_01"),
      event("pay_01", "PAYMENT_UPDATED", 100, "evt_02"),
    ];
    const groups = groupSandboxPaymentEvents(entries);
    expect(groups[0].latest.eventId).toBe("evt_02");
    expect(groups[0].history).toHaveLength(entries.length);
    expect(entries[0].eventType).toBe("PAYMENT_CREATED");
  });

  test("sem eventos retorna lista vazia", () => {
    expect(groupSandboxPaymentEvents([])).toEqual([]);
  });
});
