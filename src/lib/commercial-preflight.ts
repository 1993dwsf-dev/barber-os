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
  const from = (env.RESEND_FROM_EMAIL ?? "").trim();
  const email = (from.match(/<([^<>]+)>$/)?.[1] ?? from).trim().toLowerCase();
  const verifiedSenderCandidate =
    /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) &&
    !email.endsWith("@resend.dev");
  const convexUrl = env.CONVEX_SITE_URL?.trim().toLowerCase() ?? "";
  const originalDev = "https://unique-tortoise-387.convex.site";
  const checks: LaunchCheck[] = [
    {
      id: "isolated-convex",
      passed: validHttps(convexUrl, ".convex.site") &&
        convexUrl !== originalDev &&
        !/(^|[:/])dev:unique-tortoise-387\b/i.test(env.CONVEX_DEPLOYMENT ?? ""),
      description: "Usar deployment Convex separado do Development original.",
    },
    {
      id: "public-url",
      passed: validHttps(env.SITE_URL),
      description: "SITE_URL deve conter endereço HTTPS do frontend comercial.",
    },
    {
      id: "commercial-invitations",
      passed: env.BARBER_AUTH_COMMERCIAL_ENABLED === "true",
      description: "Habilitar cadastros comerciais com convite individual obrigatório no backend.",
    },
    {
      id: "enforced-entitlements",
      passed: env.BARBER_BILLING_ENFORCED === "true",
      description: "Exigir entitlement válido antes de operações de escrita.",
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
      passed: !!env.RESEND_API_KEY?.trim() && verifiedSenderCandidate,
      description: "Configurar API Resend e remetente de domínio próprio, nunca @resend.dev.",
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
      "Confirmar que o domínio remetente está realmente verificado no Resend e entregar OTP/reset a duas caixas externas.",
      "Concluir política e termos específicos do operador; registrar aceite versionado antes de dados reais.",
      "Testar duas barbearias reais de QA com dados fictícios e papéis distintos; fazer QA no celular.",
      "Executar backup gerenciado e restauração testada num ambiente descartável.",
      "Validar rollback, monitoramento, suporte e rotina manual de cobrança/cancelamento.",
    ],
    warning: "Pré-checagem de configuração, não autorização de lançamento ou de dados pessoais reais.",
  };
}
