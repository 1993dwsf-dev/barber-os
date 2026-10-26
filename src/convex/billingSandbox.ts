import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { HttpError } from "./lib";
import { sandboxLookupAllowed } from "../lib/asaas-lookup-config";

const SANDBOX_HOST = "https://api-sandbox.asaas.com";
const PAYMENT_ID = /^[a-zA-Z0-9_&-]{4,120}$/;
const VALID_STATUS = /^[A-Z_]{3,48}$/;

/**
 * Asaas Sandbox: manual, read-only status lookup for a previously received
 * webhook. This does not reconcile tenant ownership or provision entitlements.
 * Never expose the Asaas API key to the browser or to logs.
 */
export const checkPaymentStatus = action({
  args: { inboxId: v.id("billingWebhookInbox") },
  handler: async (ctx, { inboxId }): Promise<{
    paymentId: string;
    status: string;
    checkedAt: number;
    environment: "sandbox";
  }> => {
    // Require both private flags AND the intended Convex development deployment.
    if (!sandboxLookupAllowed()) {
      throw new HttpError("Consulta financeira Sandbox desabilitada neste ambiente.");
    }

    // Query through current authenticated caller. A tenant owner is NOT an admin.
    const allowed: boolean = await ctx.runQuery(api.platformAdmin.access, {});
    if (allowed !== true) throw new HttpError("Acesso restrito à administração da plataforma.");

    const key = process.env.BARBER_ASAAS_API_KEY?.trim();
    if (!key || key.length < 20 || /\s/.test(key)) {
      throw new HttpError("Chave privada de consulta do Asaas Sandbox não configurada.");
    }

    // ID of an already-stored webhook record, never an arbitrary external URL.
    const event: { paymentId: string; eventId: string } | null =
      await ctx.runQuery(internal.platformAdmin.billingInboxPaymentForLookup, { id: inboxId });
    if (!event || !PAYMENT_ID.test(event.paymentId)) {
      throw new HttpError("Evento Sandbox não encontrado.");
    }

    const url = `${SANDBOX_HOST}/v3/payments/${encodeURIComponent(event.paymentId)}/status`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          "access_token": key,
          "accept": "application/json",
          "User-Agent": "BarberOS-Sandbox/0.1",
        },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
    } catch {
      throw new HttpError("Não foi possível consultar o status no Asaas Sandbox.");
    }

    if (!response.ok) {
      // Never echo provider errors: they might include sensitive account data.
      throw new HttpError("Consulta ao Asaas Sandbox não concluída; confira a chave e o status do serviço.");
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new HttpError("Asaas Sandbox retornou uma resposta inválida.");
    }

    if (!json || typeof json !== "object" || Array.isArray(json) ||
        !("status" in json) || typeof json.status !== "string" ||
        !VALID_STATUS.test(json.status)) {
      throw new HttpError("Asaas Sandbox retornou um status desconhecido.");
    }
    // No data is persisted; no tenant read/write, no grant of access.
    return {
      paymentId: event.paymentId,
      status: json.status,
      checkedAt: Date.now(),
      environment: "sandbox" as const,
    };
  },
});
