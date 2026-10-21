import { Email } from "@convex-dev/auth/providers/Email";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

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

async function sendAccessCode(email: string, token: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !from?.trim()) {
    throw new Error("Envio indisponível: configure RESEND_API_KEY e RESEND_FROM_EMAIL no Convex.");
  }

  const response = await fetch(emailEndpoint(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Seu código de acesso ao Barber OS",
      text: `Seu código de acesso ao Barber OS é ${token}.\n\nO código expira em 15 minutos. Se você não solicitou este acesso, ignore a mensagem. Não compartilhe o código.`,
    }),
  });

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
