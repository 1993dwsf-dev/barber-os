/**
 * Define os provedores efetivamente registrados pelo Convex Auth.
 * No piloto Google-only, os provedores OTP, senha e anônimo não são expostos
 * no servidor, mesmo que o frontend seja contornado.
 */
export type PilotAuthFlags = {
  googleOnly: boolean;
  authV2: boolean;
  googleEnabled: boolean;
  googleCredentials: boolean;
  localBackend: boolean;
};

export function enabledAuthMethods(flags: PilotAuthFlags) {
  return {
    otp: !flags.googleOnly,
    password: flags.authV2 && !flags.googleOnly,
    google: (flags.authV2 || flags.googleOnly) &&
      flags.googleEnabled && flags.googleCredentials,
    anonymous: flags.localBackend && !flags.googleOnly,
  };
}
