import { internalQuery } from "./_generated/server";
import { evaluateCommercialConfig } from "../lib/commercial-preflight";

/**
 * Diagnóstico somente via CLI/admin do Convex; NÃO é uma query pública.
 * Não acessa nem retorna valores de segredos; somente indicadores booleanos.
 *
 * Exemplo (apenas no NOVO deployment comercial):
 *   bunx convex run launchReadiness:preflight
 */
export const preflight = internalQuery({
  args: {},
  handler: async () => evaluateCommercialConfig(process.env),
});
