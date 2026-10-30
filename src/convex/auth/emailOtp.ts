import { Email } from "@convex-dev/auth/providers/Email";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, internalQuery } from "../_generated/server";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";
import { authorizeCurrentEmail, authorizeCurrentTransactionalEmail } from "./accessPolicy";
import { buildTransactionalEmailRequest, selectTransactionalEmailProvider } from "../../lib/transactional-email";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const codePurpose = v.union(v.literal("access"), v.literal("verification"), v.literal("reset"));
type CodePurpose = "access" | "verification" | "reset";
type ManualSink = (request: { email: string; token: string; purpose: CodePurpose }) => Promise<unknown>;

/** Somente funções internas podem gravar códigos; não existe query pública.
 *  O operador deve confirmar o contato por um canal independente antes da entrega.
 */
export const enqueueManualCode = internalMutation({
  args: { email: v.string(), token: v.string(), purpose: codePurpose },
  handler: async (ctx, args) => {
    if (process.env.BARBER_EMAIL_PROVIDER !== "manual") {
      throw new Error("Entrega manual não habilitada.");
    }
    const email = authorizeCurrentEmail(args.email);
    const length = args.purpose === "access" ? 6 : 8;
    if (!new RegExp("^\\d{" + length + "}$").test(args.token)) {
      throw new Error("Código de autenticação inválido.");
    }
    const now = Date.now();
    const previous = await ctx.db.query("manualAuthCodes")
      .withIndex("by_email", q => q.eq("email", email)).collect();
    for (const item of previous) {
      if (item.purpose === args.purpose || item.expiresAt <= now) await ctx.db.delete(item._id);
    }
    const expired = await ctx.db.query("manualAuthCodes")
      .withIndex("by_expires", q => q.lt("expiresAt", now)).take(50);
    for (const item of expired) await ctx.db.delete(item._id);
    await ctx.db.insert("manualAuthCodes", {
      email, token: args.token, purpose: args.purpose,
      createdAt: now, expiresAt: now + 15 * 60_000,
    });
  },
});

/** Consulta EXCLUSIVAMENTE INTERNA para o operador com acesso ao Dashboard Convex.
 * Nunca invocar em frontend, workflow público ou logs.
 */
export const pendingManualCodes = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    if (process.env.BARBER_EMAIL_PROVIDER !== "manual") {
      throw new Error("Entrega manual não habilitada.");
    }
    const normalized = authorizeCurrentEmail(email);
    const rows = await ctx.db.query("manualAuthCodes")
      .withIndex("by_email", q => q.eq("email", normalized)).take(10);
    return rows.filter(row => row.expiresAt > Date.now())
      .map(row => ({ purpose: row.purpose, token: row.token, expiresAt: row.expiresAt }));
  },
});

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
  purpose: CodePurpose = "access",
  manualSink?: ManualSink,
): Promise<void> {
  // O modo manual mantém a verificação do Convex Auth, mas entrega o código
  // por canal privado após conferência de identidade pelo operador.
  if (process.env.BARBER_EMAIL_PROVIDER === "manual") {
    if (!manualSink) throw new Error("Canal privado para entrega manual indisponível.");
    await manualSink({ email: authorizeCurrentEmail(email), token, purpose });
    return;
  }
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
  async sendVerificationRequest({ identifier: email, token }, ctx) {
    await sendAccessCode(email, token, "access", args =>
      ctx.runMutation(internal["auth/emailOtp"].enqueueManualCode, args));
  },
});
