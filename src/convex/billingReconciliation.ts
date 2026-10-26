import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { HttpError } from "./lib";
import { sandboxLookupAllowed } from "../lib/asaas-lookup-config";
import { reviewSandboxPayment } from "../lib/asaas-payment-verification";
import type { AsaasPaymentReview } from "../lib/asaas-payment-verification";

const ID = /^[a-zA-Z0-9_&-]{4,120}$/;

/**
 * On-demand independent snapshot of Asaas Sandbox charge state.
 * It cannot verify business/customer ownership of a manually linked charge.
 * It cannot modify any entitlement, subscription or billing link.
 */
export const reviewLink = action({
  args: { linkId: v.id("sandboxBillingLinks") },
  handler: async (ctx, { linkId }): Promise<AsaasPaymentReview & { checkedAt: number }> => {
    if (!sandboxLookupAllowed()) {
      throw new HttpError("Consulta à API do Asaas Sandbox desabilitada.");
    }
    const isAdmin: boolean = await ctx.runQuery(api.platformAdmin.access, {});
    if (!isAdmin) throw new HttpError("Acesso restrito à administração da plataforma.");

    const link: { paymentId: string; expectedPriceCents: number; organizationId: string } | null =
      await ctx.runQuery(internal.platformBilling.linkForReview, { linkId });
    if (!link || !ID.test(link.paymentId)) throw new HttpError("Vínculo inexistente ou invalidado.");
    const key = process.env.BARBER_ASAAS_API_KEY?.trim();
    if (!key || key.length < 20 || /\s/.test(key)) {
      throw new HttpError("Chave privada da API Sandbox ausente ou inválida.");
    }

    let response: Response;
    try {
      response = await fetch(
        `https://api-sandbox.asaas.com/v3/payments/${encodeURIComponent(link.paymentId)}`,
        {
          method: "GET",
          headers: {
            "access_token": key,
            "accept": "application/json",
            "User-Agent": "BarberOS-Sandbox/0.1",
          },
          signal: AbortSignal.timeout(8_000),
          cache: "no-store",
        },
      );
    } catch {
      throw new HttpError("Falha de conexão com Asaas Sandbox.");
    }
    if (!response.ok) {
      // Never echo provider's body or confidential API identifiers.
      throw new HttpError("Não foi possível consultar a cobrança no Asaas Sandbox.");
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new HttpError("Resposta inválida do Asaas Sandbox.");
    }
    try {
      return {
        ...reviewSandboxPayment(payload, link.paymentId, link.expectedPriceCents),
        checkedAt: Date.now(),
      };
    } catch {
      throw new HttpError("Dados da cobrança incompatíveis com a verificação Sandbox.");
    }
  },
});
