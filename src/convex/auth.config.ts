import type { AuthConfig } from "convex/server";

/**
 * Apenas tokens emitidos pelo Convex Auth deste deployment são aceitos.
 * A autenticação é independente de provedores externos de identidade.
 */
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
