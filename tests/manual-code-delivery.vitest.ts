import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { internal } from "../src/convex/_generated/api";
import schema from "../src/convex/schema";

const modules = import.meta.glob("../src/convex/**/*.ts");
let t: ReturnType<typeof convexTest<typeof schema>>;

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("BARBER_EMAIL_PROVIDER", "manual");
  vi.stubEnv("BARBER_AUTH_COMMERCIAL_ENABLED", "true");
  t = convexTest(schema, modules);
});
afterEach(() => vi.unstubAllEnvs());

test("somente consultas internas acessam códigos pendentes da identidade solicitada", async () => {
  await t.mutation(internal["auth/emailOtp"].enqueueManualCode, {
    email: " Dono@Example.com ", token: "12345678", purpose: "verification",
  });
  const items = await t.query(internal["auth/emailOtp"].pendingManualCodes, {
    email: "dono@example.com",
  });
  expect(items).toHaveLength(1);
  expect(items[0].token).toBe("12345678");
  expect(items[0].expiresAt).toBeGreaterThan(Date.now());
  expect(await t.query(internal["auth/emailOtp"].pendingManualCodes, {
    email: "outro@example.com",
  })).toEqual([]);
});

test("solicitar novo código revoga o anterior no mesmo fluxo", async () => {
  const args = { email: "dono@example.com", purpose: "reset" as const };
  await t.mutation(internal["auth/emailOtp"].enqueueManualCode, { ...args, token: "00000001" });
  await t.mutation(internal["auth/emailOtp"].enqueueManualCode, { ...args, token: "00000002" });
  const codes = await t.query(internal["auth/emailOtp"].pendingManualCodes, { email: args.email });
  expect(codes).toHaveLength(1);
  expect(codes[0].token).toBe("00000002");
});

test("consulta não retorna códigos vencidos", async () => {
  await t.mutation(internal["auth/emailOtp"].enqueueManualCode, {
    email: "dono@example.com", token: "123456", purpose: "access",
  });
  await t.run(async ctx => {
    const docs = await ctx.db.query("manualAuthCodes").collect();
    for (const d of docs) await ctx.db.patch(d._id, { expiresAt: Date.now() - 1 });
  });
  expect(await t.query(internal["auth/emailOtp"].pendingManualCodes, {
    email: "dono@example.com",
  })).toEqual([]);
});

test("modo manual rejeita token inválido e envio se a opção estiver desligada", async () => {
  await expect(t.mutation(internal["auth/emailOtp"].enqueueManualCode, {
    email: "dono@example.com", token: "123456", purpose: "verification",
  })).rejects.toThrow(/Código de autenticação inválido/i);
  vi.stubEnv("BARBER_EMAIL_PROVIDER", "resend");
  await expect(t.mutation(internal["auth/emailOtp"].enqueueManualCode, {
    email: "dono@example.com", token: "12345678", purpose: "verification",
  })).rejects.toThrow(/não habilitada/i);
  await expect(t.query(internal["auth/emailOtp"].pendingManualCodes, {
    email: "dono@example.com",
  })).rejects.toThrow(/não habilitada/i);
});
