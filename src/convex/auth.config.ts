import type { AuthConfig } from "convex/server";

/**
 * Apenas tokens emitidos pelo Convex Auth deste deployment são aceitos.
 * A antiga identidade federada Freebuff/Vly foi desativada.
 */
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
