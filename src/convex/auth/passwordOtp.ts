import { Email } from "@convex-dev/auth/providers/Email";
import { internal } from "../_generated/api";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";
import { sendAccessCode } from "./emailOtp";

function makeEmailCodeProvider(id: string, purpose: "verification" | "reset") {
  return Email({
    id,
    maxAge: 60 * 15,
    async generateVerificationToken() {
      const reader: RandomReader = {
        read(bytes: Uint8Array) {
          crypto.getRandomValues(bytes);
        },
      };
      return generateRandomString(reader, "0123456789", 8);
    },
    async sendVerificationRequest({ identifier, token }, ctx) {
      await sendAccessCode(identifier, token, purpose, args =>
        ctx.runMutation(internal["auth/emailOtp"].enqueueManualCode, args));
    },
  });
}

export const passwordVerification = makeEmailCodeProvider(
  "barber-password-email-verification",
  "verification",
);
export const passwordReset = makeEmailCodeProvider(
  "barber-password-reset",
  "reset",
);
