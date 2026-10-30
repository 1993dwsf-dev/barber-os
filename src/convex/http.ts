import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import {
  matchWebhookSecret,
  parseAsaasSandboxEvent,
} from "../lib/asaas-sandbox-webhook";

const http = httpRouter();

auth.addHttpRoutes(http);

/**
 * Sandbox-only payment notification inbox.
 *
 * Webhook authentication is completely independent of tenant auth.
 * This is intentionally NOT an entitlement activation endpoint.
 */
http.route({
  path: "/integrations/asaas/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Fail closed even if the wrong Convex deployment receives this request.
    const enabled = process.env.BARBER_ASAAS_WEBHOOK_ENABLED === "true" &&
      process.env.BARBER_ASAAS_ENV === "sandbox" &&
      process.env.BARBER_BILLING_ENFORCED !== "true" &&
      process.env.CONVEX_CLOUD_URL?.replace(/\/$/, "") ===
        "https://unique-tortoise-387.convex.cloud";
    if (!enabled) return new Response("Not Found", { status: 404 });

    const expected = process.env.BARBER_ASAAS_WEBHOOK_TOKEN ?? "";
    const received = request.headers.get("asaas-access-token");
    if (!(await matchWebhookSecret(received, expected))) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Do not store raw event JSON. Reject oversized payloads and bad JSON.
    const type = request.headers.get("content-type") ?? "";
    if (!/^application\/json(?:;|$)/i.test(type)) {
      return new Response("Unsupported Media Type", { status: 415 });
    }
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > 64 * 1024) return new Response("Payload Too Large", { status: 413 });

    let input: unknown;
    try {
      const raw = await request.text();
      if (raw.length > 64 * 1024) return new Response("Payload Too Large", { status: 413 });
      input = JSON.parse(raw);
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    const parsed = parseAsaasSandboxEvent(input);
    // Acknowledge unrelated events: Asaas expects 200 for successful delivery.
    if (parsed.kind === "ignored") return new Response("OK", { status: 200 });
    if (parsed.kind === "invalid") return new Response("Bad Request", { status: 400 });

    try {
      await ctx.runMutation(internal.platformAdmin.recordAsaasSandboxEvent, parsed.value);
      return new Response("OK", { status: 200 });
    } catch {
      // No secrets/payloads in response or logs. Trigger provider retry.
      return new Response("Temporary Error", { status: 503 });
    }
  }),
});

/** Caixa de códigos exclusiva do Convex Production, sem provedor de email. */
http.route({
  path: "/internal/manual-auth-code",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (process.env.BARBER_EMAIL_PROVIDER !== "manual" ||
        process.env.CONVEX_SITE_URL !== "https://clever-squid-863.convex.site") {
      return new Response("Not Found", { status: 404 });
    }
    const secret = process.env.BARBER_MANUAL_INBOX_SECRET ?? "";
    if (!(await matchWebhookSecret(request.headers.get("x-barber-inbox-secret"), secret))) {
      return new Response("Unauthorized", { status: 401 });
    }
    if (!(request.headers.get("content-type") ?? "").startsWith("application/json")) {
      return new Response("Unsupported Media Type", { status: 415 });
    }
    if (Number(request.headers.get("content-length") ?? "0") > 1024) {
      return new Response("Payload Too Large", { status: 413 });
    }
    try {
      const raw = await request.text();
      if (raw.length > 1024) return new Response("Payload Too Large", { status: 413 });
      const data: unknown = JSON.parse(raw);
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        return new Response("Bad Request", { status: 400 });
      }
      const o = data as Record<string, unknown>;
      if (typeof o.email !== "string" || typeof o.token !== "string" ||
          (o.purpose !== "access" && o.purpose !== "verification" && o.purpose !== "reset")) {
        return new Response("Bad Request", { status: 400 });
      }
      await ctx.runMutation(internal.auth.emailOtp.enqueueManualCode, {
        email: o.email, token: o.token, purpose: o.purpose,
      });
      return new Response("OK", { status: 200, headers: { "cache-control": "no-store" } });
    } catch {
      return new Response("Bad Request", { status: 400 });
    }
  }),
});

export default http;
