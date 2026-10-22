/** Política de cadastro e acesso na migração de autenticação.
 * Em homologação hospedada, apenas o e-mail autorizado pode iniciar sessão.
 * A abertura comercial exige sinalização explícita no backend Convex.
 */
export function authorizeEmail(
  input: string,
  config: { siteUrl: string; stagingEmail?: string; commercialEnabled: boolean },
): string {
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Informe um e-mail válido.");
  }
  const isLocal = /^http:\/\/(localhost|127\.0\.0\.1):/.test(config.siteUrl);
  if (!isLocal && !config.commercialEnabled) {
    const allowed = config.stagingEmail?.trim().toLowerCase();
    if (!allowed || email !== allowed) {
      throw new Error("A homologação está restrita ao e-mail autorizado.");
    }
  }
  return email;
}

export function authorizeCurrentEmail(email: string): string {
  return authorizeEmail(email, {
    siteUrl: process.env.CONVEX_SITE_URL ?? "",
    stagingEmail: process.env.BARBER_STAGING_EMAIL,
    commercialEnabled: process.env.BARBER_AUTH_COMMERCIAL_ENABLED === "true",
  });
}
