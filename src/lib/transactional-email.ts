/**
 * Adaptador puro para envio de OTP/reset por Resend ou Brevo.
 * O provedor é escolhido no backend Convex; nunca expor chaves ao frontend.
 * Sem fallback automático: erro de provedor deve ser visível ao operador,
 * não gerar múltiplos envios de códigos nem mascarar falhas.
 */
export type TransactionalEmailProvider = "resend" | "brevo";

export function selectTransactionalEmailProvider(raw?: string): TransactionalEmailProvider {
  const name = (raw ?? "resend").trim().toLowerCase() || "resend";
  if (name !== "resend" && name !== "brevo") {
    throw new Error("Provedor de e-mail não reconhecido. Configure BARBER_EMAIL_PROVIDER.");
  }
  return name;
}

export function buildTransactionalEmailRequest(args: {
  provider: TransactionalEmailProvider;
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}): {
  url: string;
  init: { method: "POST"; headers: Record<string, string>; body: string };
} {
  const { provider, apiKey, from, to, subject, text } = args;
  if (!apiKey.trim() || !from.trim()) throw new Error("Configuração de e-mail incompleta.");

  if (provider === "resend") {
    return {
      url: "https://api.resend.com/emails",
      init: {
        method: "POST",
        headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject, text }),
      },
    };
  }

  const parsed = /^(.+?)\s*<([^<>]+)>$/.exec(from.trim());
  const email = (parsed ? parsed[2] : from).trim().toLowerCase();
  const name = (parsed ? parsed[1] : "Barber OS").trim().replace(/^"|"$/g, "");
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || !name) {
    throw new Error("Remetente Brevo inválido. Configure BREVO_FROM_EMAIL corretamente.");
  }
  return {
    url: "https://api.brevo.com/v3/smtp/email",
    init: {
      method: "POST",
      headers: { "api-key": apiKey, accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: { name, email },
        to: [{ email: to }],
        subject,
        textContent: text,
      }),
    },
  };
}
