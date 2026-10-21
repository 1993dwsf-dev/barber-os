import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { emailOtp } from "./auth/emailOtp";

/**
 * Esta branch é exclusiva de homologação.
 * Acesso visitante só é permitido no Convex LOCAL usado pelo teste Chromium;
 * os deployments hospedados aceitam exclusivamente o provider de e-mail.
 */
const site = process.env.CONVEX_SITE_URL ?? "";
const localBackend = /^http:\/\/(localhost|127\.0\.0\.1):/.test(site);

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [emailOtp, ...(localBackend ? [Anonymous] : [])],
});
