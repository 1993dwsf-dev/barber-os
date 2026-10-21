import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { emailOtp } from "./auth/emailOtp";

/** Homologação: restringir a autenticação ao e-mail configurado no Convex. */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [emailOtp, ...(process.env.BARBER_STAGING_EMAIL ? [] : [Anonymous])],
});
