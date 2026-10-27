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


/**
 * Acesso Google de funcionários em homologação: apenas e-mails explicitamente
 * listados. O OTP e a senha continuam restritos ao endereço original, pois
 * o remetente Resend de testes não entrega códigos a outros destinatários.
 *
 * BARBER_STAGING_GOOGLE_EMAILS = e-mails separados por vírgula ou nova linha.
 * A variável é privada do Convex. Ausente: comportamento antigo, um e-mail.
 */
export function authorizeGoogleEmail(
  input: string,
  config: {
    siteUrl: string;
    stagingEmail?: string;
    stagingGoogleEmails?: string;
    commercialEnabled: boolean;
  },
): string {
  const email = input.trim().toLowerCase();
  // Valida formato, comprimento e normaliza sem afrouxar o acesso hospedado.
  const validated = authorizeEmail(email, { ...config, commercialEnabled: true });
  const local = /^http:\/\/(localhost|127\.0\.0\.1):/.test(config.siteUrl);
  if (local || config.commercialEnabled) return validated;

  const primary = config.stagingEmail?.trim().toLowerCase();
  // Exige que a configuração original exista para evitar abertura acidental.
  if (!primary || email === primary) {
    return authorizeEmail(validated, {
      siteUrl: config.siteUrl,
      stagingEmail: config.stagingEmail,
      commercialEnabled: false,
    });
  }
  const raw = (config.stagingGoogleEmails ?? "").trim();
  const extra = raw ? raw.split(/[,\n;]+/).map(e => e.trim().toLowerCase()).filter(Boolean) : [];
  // Falha fechada em lista malformada ou extensa (não é cadastro público).
  if (extra.length > 10 || extra.some(e => e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) {
    throw new Error("Lista de e-mails Google da homologação inválida.");
  }
  if (!extra.includes(email)) {
    throw new Error("A homologação está restrita ao e-mail autorizado.");
  }
  return validated;
}

export function authorizeCurrentGoogleEmail(email: string): string {
  return authorizeGoogleEmail(email, {
    siteUrl: process.env.CONVEX_SITE_URL ?? "",
    stagingEmail: process.env.BARBER_STAGING_EMAIL,
    stagingGoogleEmails: process.env.BARBER_STAGING_GOOGLE_EMAILS,
    commercialEnabled: process.env.BARBER_AUTH_COMMERCIAL_ENABLED === "true",
  });
}

/** Contas extras Google só podem aderir via convite de equipe, não criar tenant. */
export function mayCreateHostedStagingOrganization(
  email: string,
  config: {
    siteUrl: string;
    stagingEmail?: string;
    stagingGoogleEmails?: string;
    commercialEnabled: boolean;
  },
): boolean {
  if (config.commercialEnabled || /^http:\/\/(localhost|127\.0\.0\.1):/.test(config.siteUrl)) return true;
  if (!(config.stagingGoogleEmails ?? "").trim()) return true;
  return email.trim().toLowerCase() === config.stagingEmail?.trim().toLowerCase();
}


// Aplica uma política única para códigos OTP, verificação e reset.
// A flag comercial não dispensa a configuração de um remetente próprio no Resend.
export function authorizeTransactionalEmail(
  input: string,
  config: {
    siteUrl: string;
    stagingEmail?: string;
    commercialEnabled: boolean;
    fromEmail?: string;
  },
): string {
  const recipient = authorizeEmail(input, config);
  const local = /^http:\/\/(localhost|127\.0\.0\.1):/.test(config.siteUrl);
  if (!local && config.commercialEnabled) {
    const sender = config.fromEmail?.trim() ?? "";
    const address = (sender.match(/<([^<>]+)>$/)?.[1] ?? sender).trim().toLowerCase();
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ||
      address.endsWith("@resend.dev")
    ) {
      throw new Error(
        "Envio comercial indisponível: configure um remetente com domínio próprio verificado no Resend.",
      );
    }
  }
  return recipient;
}

export function authorizeCurrentTransactionalEmail(email: string, fromEmail: string): string {
  return authorizeTransactionalEmail(email, {
    siteUrl: process.env.CONVEX_SITE_URL ?? "",
    stagingEmail: process.env.BARBER_STAGING_EMAIL,
    commercialEnabled: process.env.BARBER_AUTH_COMMERCIAL_ENABLED === "true",
    fromEmail,
  });
}
