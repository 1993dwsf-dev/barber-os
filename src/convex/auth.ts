import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { Password } from "@convex-dev/auth/providers/Password";
import Google from "@auth/core/providers/google";
import { emailOtp } from "./auth/emailOtp";
import { passwordReset, passwordVerification } from "./auth/passwordOtp";
import { authorizeCurrentEmail } from "./auth/accessPolicy";
import { enabledAuthMethods } from "../lib/mvp-auth-config";

/**
 * Migração gradual: o OTP continua disponível na homologação.
 * Nenhum provedor novo é habilitado sem flag explícita no backend.
 * No ambiente hospedado de testes, o cadastro é restrito ao e-mail permitido.
 */
const site = process.env.CONVEX_SITE_URL ?? "";
const localBackend = /^http:\/\/(localhost|127\.0\.0\.1):/.test(site);
const authV2 = process.env.BARBER_AUTH_V2_ENABLED === "true";
// Flag privada de produção/piloto: remove OTP, senha e modo anônimo como provedores.
const googleOnly = process.env.BARBER_MVP_GOOGLE_ONLY === "true";
const enabled = enabledAuthMethods({
  googleOnly,
  authV2,
  googleEnabled: process.env.BARBER_GOOGLE_AUTH_ENABLED === "true",
  googleCredentials: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  localBackend,
});

const passwordProvider = Password({
  reset: passwordReset,
  verify: passwordVerification,
  profile(params) {
    if (typeof params.email !== "string") {
      throw new Error("Informe um e-mail válido.");
    }
    return { email: authorizeCurrentEmail(params.email) };
  },
  validatePasswordRequirements(secret) {
    if (
      secret.length < 10 ||
      secret.length > 128 ||
      !/[a-zA-Z]/.test(secret) ||
      !/[0-9]/.test(secret)
    ) {
      throw new Error("A senha deve ter entre 10 e 128 caracteres, com letras e números.");
    }
  },
});

const googleProvider = Google({
  profile(profile) {
    if (!profile.sub || !profile.email || profile.email_verified !== true) {
      throw new Error("A conta Google precisa ter um e-mail verificado.");
    }
    return {
      id: profile.sub,
      name: profile.name ?? undefined,
      email: authorizeCurrentEmail(profile.email),
      // Sinal de verificação do Google só é aceito após checar email_verified === true.
      // Convex Auth utiliza este indicador para marcar o endereço como verificado.
      emailVerified: true,
      image: profile.picture ?? undefined,
    };
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    ...(enabled.otp ? [emailOtp] : []),
    ...(enabled.password ? [passwordProvider] : []),
    ...(enabled.google ? [googleProvider] : []),
    ...(enabled.anonymous ? [Anonymous] : []),
  ],
});
