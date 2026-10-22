import type { AuthConfig } from "convex/server";

/**
 * Apenas tokens emitidos pelo Convex Auth deste deployment são aceitos.
 * OAuth Google e credenciais locais são validados pelo Convex Auth no backend.
 */
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
