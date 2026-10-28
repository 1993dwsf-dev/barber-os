import { Email } from "@convex-dev/auth/providers/Email";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";
import { authorizeCurrentTransactionalEmail } from "./accessPolicy";
import { buildTransactionalEmailRequest, selectTransactionalEmailProvider } from "../../lib/transactional-email";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Exceção de URL apenas para teste de navegador com Convex local isolado. */
function emailEndpoint(): string {
  const override = process.env.RESEND_API_URL;
  if (!override) return RESEND_ENDPOINT;

  const site = process.env.CONVEX_SITE_URL;
  const local = site?.startsWith("http://127.0.0.1:") ||
    site?.startsWith("http://localhost:");
  if (!local || override !== "http://127.0.0.1:8765/emails") {
    throw new Error("RESEND_API_URL só é permitida no teste local.");
  }
  return override;
}

export async function sendAccessCode(
  email: string,
  token: string,
  purpose: "access" | "verification" | "reset" = "access",
): Promise<void> {
  const provider = selectTransactionalEmailProvider(process.env.BARBER_EMAIL_PROVIDER);
  const key = provider === "brevo" ? process.env.BREVO_API_KEY : process.env.RESEND_API_KEY;
  const from = provider === "brevo" ? process.env.BREVO_FROM_EMAIL : process.env.RESEND_FROM_EMAIL;
  if (!key || !from?.trim()) {
    throw new Error("Envio indisponível: configuração do provedor de e-mail selecionado ausente no Convex.");
  }
  // Preserva a allowlist em homologação e exige remetente próprio no
  // ambiente comercial. O endereço retornado é normalizado e validado.
  const recipient = authorizeCurrentTransactionalEmail(email, from);

  const request = buildTransactionalEmailRequest({
    provider,
    apiKey: key,
    from,
    to: recipient,
    subject:
      purpose === "reset"
        ? "Redefinição de senha do Barber OS"
        : purpose === "verification"
          ? "Confirme seu e-mail no Barber OS"
          : "Seu código de acesso ao Barber OS",
    text: `Seu código de ${purpose === "reset" ? "redefinição de senha" : purpose === "verification" ? "verificação de e-mail" : "acesso"} ao Barber OS é ${token}.\n\nO código expira em 15 minutos. Se você não solicitou, ignore. Não compartilhe o código.`,
  });
  // O mock de rede do browser smoke é EXCLUSIVO para Resend no Convex local.
  const endpoint = provider === "resend" ? emailEndpoint() : request.url;
  const response = await fetch(endpoint, request.init);

  // Não registrar códigos OTP, chaves, cabeçalhos nem resposta do serviço.
  if (!response.ok) {
    throw new Error(`Falha ao enviar código de acesso (HTTP ${response.status}).`);
  }
}

export const emailOtp = Email({
  id: "email-otp", // preserva o identificador Convex Auth existente
  maxAge: 60 * 15,
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    return generateRandomString(random, "0123456789", 6);
  },
  async sendVerificationRequest({ identifier: email, token }) {
    await sendAccessCode(email, token);
  },
});
