/**
 * Diagnóstico de configuração para um deployment comercial ISOLADO.
 * Nenhuma chave, endereço de cliente ou código de convite é exposto.
 *
 * Um resultado positivo NÃO libera dados reais: LGPD, restore, entregabilidade,
 * isolamento em duas contas e rollback são testes manuais separados.
 */
export type CommercialEnv = {
  BARBER_AUTH_COMMERCIAL_ENABLED?: string;
  BARBER_BILLING_ENFORCED?: string;
  BARBER_AUTH_V2_ENABLED?: string;
  BARBER_GOOGLE_AUTH_ENABLED?: string;
  BARBER_MVP_GOOGLE_ONLY?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  BARBER_EMAIL_PROVIDER?: string;
  BREVO_API_KEY?: string;
  BREVO_FROM_EMAIL?: string;
  SITE_URL?: string;
  CONVEX_SITE_URL?: string;
  CONVEX_DEPLOYMENT?: string;
  JWT_PRIVATE_KEY?: string;
  JWKS?: string;
};

export type LaunchCheck = {
  id: string;
  passed: boolean;
  description: string;
};

export function evaluateCommercialConfig(env: CommercialEnv) {
  const validHttps = (value: string | undefined, suffix?: string): boolean => {
    try {
      const parsed = new URL(value ?? "");
      return parsed.protocol === "https:" &&
        !parsed.username && !parsed.password &&
        !!parsed.hostname &&
        (suffix ? parsed.hostname.endsWith(suffix) : true);
    } catch {
      return false;
    }
  };
  const provider = (env.BARBER_EMAIL_PROVIDER ?? "resend").trim().toLowerCase() || "resend";
  const supportedProvider = provider === "resend" || provider === "brevo";
  const selectedKey = provider === "brevo" ? env.BREVO_API_KEY : env.RESEND_API_KEY;
  const from = (provider === "brevo" ? env.BREVO_FROM_EMAIL : env.RESEND_FROM_EMAIL)?.trim() ?? "";
  const email = (from.match(/<([^<>]+)>$/)?.[1] ?? from).trim().toLowerCase();
  // Candidatura sintática: somente um teste real comprova remetente aprovado e entrega.
  // O Brevo pode reescrever remetentes gratuitos para um domínio técnico.
  const senderCandidate =
    /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) &&
    !email.endsWith("@resend.dev");
  const convexUrl = env.CONVEX_SITE_URL?.trim().toLowerCase() ?? "";
  const deployment = env.CONVEX_DEPLOYMENT?.trim().toLowerCase() ?? "";
  // Nunca aceitar chave de DEV, deploy ausente ou endpoint da homologação.
  // O nome do deployment é parte pública do endereço Convex HTTP Actions.
  const prodMatch = /^prod:([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(deployment);
  const isolatedConvex = !!prodMatch &&
    convexUrl === `https://${prodMatch[1]}.convex.site` &&
    prodMatch[1] !== "unique-tortoise-387" &&
    validHttps(convexUrl, ".convex.site");

  // Cloudflare Pages pode ser usado sem domínio próprio, desde que seja um
  // projeto comercial NOVO. Proibir URLs do projeto de homologação/piloto,
  // incluindo suas prévias *.pages.dev.
  const isIsolatedFrontend = (() => {
    if (!validHttps(env.SITE_URL)) return false;
    const url = new URL(env.SITE_URL!);
    const hostname = url.hostname.toLowerCase();
    return !["barber-os.pages.dev", "barber-os-piloto.pages.dev"]
      .some(host => hostname === host || hostname.endsWith("." + host));
  })();

  const checks: LaunchCheck[] = [
    {
      id: "isolated-convex",
      passed: isolatedConvex,
      description: "Exigir CONVEX_DEPLOYMENT=prod:... com URL correspondente e distinta da homologação.",
    },
    {
      id: "public-url",
      passed: isIsolatedFrontend,
      description: "SITE_URL deve ser HTTPS de site novo e não pode reutilizar projetos Pages da homologação.",
    },
    {
      id: "commercial-invitations",
      passed: env.BARBER_AUTH_COMMERCIAL_ENABLED === "true",
      description: "Habilitar cadastros comerciais com convite individual obrigatório no backend.",
    },
    {
      id: "enforced-entitlements",
      passed: env.BARBER_BILLING_ENFORCED === "true" ||
        env.BARBER_AUTH_COMMERCIAL_ENABLED === "true",
      description: "Exigir prazo de acesso válido por convite comercial ou bloqueio de cobrança; não processa pagamentos.",
    },
    {
      id: "password-login",
      passed: env.BARBER_AUTH_V2_ENABLED === "true" &&
        env.BARBER_MVP_GOOGLE_ONLY !== "true",
      description: "Habilitar login por senha e manter modo exclusivo Google desativado.",
    },
    {
      id: "google-disabled",
      passed: env.BARBER_GOOGLE_AUTH_ENABLED !== "true",
      description: "Manter Google desativado conforme a decisão atual do piloto.",
    },
    {
      id: "email-delivery",
      passed: supportedProvider && !!selectedKey?.trim() && senderCandidate,
      description: "Configurar Resend ou Brevo com chave privada e remetente válido (envio real a validar).",
    },
    {
      id: "auth-keys",
      passed: !!env.JWT_PRIVATE_KEY?.trim() && !!env.JWKS?.trim(),
      description: "Configurar chaves JWT exclusivas e válidas neste deployment.",
    },
  ];

  return {
    configurationReady: checks.every(c => c.passed),
    checks,
    pendingManualVerification: [
      "Confirmar na conta do provedor selecionado que o remetente foi aprovado; enviar OTP, confirmação e reset a duas caixas externas, conferir spam e domínio apresentado.",
      "Concluir política e termos específicos do operador; registrar aceite versionado antes de dados reais.",
      "Testar duas barbearias reais de QA com dados fictícios e papéis distintos; fazer QA no celular.",
      "Executar backup gerenciado e restauração testada num ambiente descartável.",
      "Validar rollback, monitoramento, suporte e controle de acesso; cobrança das assinaturas ocorre exclusivamente fora do Barber OS.",
    ],
    warning: "Pré-checagem de configuração, não autorização de lançamento ou de dados pessoais reais.",
  };
}
