import { describe, expect, test } from "vitest";
import { enabledAuthMethods } from "../src/lib/mvp-auth-config";
import { authorizeEmail } from "../src/convex/auth/accessPolicy";

const normal = {
  googleOnly: false,
  authV2: true,
  googleEnabled: true,
  googleCredentials: true,
  localBackend: false,
};

describe("MVP: apenas login Google", () => {
  test("desliga OTP, senha e visitante também no backend", () => {
    expect(enabledAuthMethods({ ...normal, googleOnly: true })).toEqual({
      otp: false, password: false, google: true, anonymous: false,
    });
    expect(enabledAuthMethods({ ...normal, googleOnly: true, localBackend: true }).anonymous).toBe(false);
  });

  test("não abre outro método se a chave OAuth estiver ausente", () => {
    const methods = enabledAuthMethods({
      ...normal, googleOnly: true, googleCredentials: false,
    });
    expect(methods).toEqual({
      otp: false, password: false, google: false, anonymous: false,
    });
  });

  test("mantém provedores anteriores na homologação sem a flag", () => {
    expect(enabledAuthMethods(normal)).toEqual({
      otp: true, password: true, google: true, anonymous: false,
    });
    expect(enabledAuthMethods({ ...normal, localBackend: true }).anonymous).toBe(true);
  });

  test("comercial exige abertura explícita no servidor, nunca só no frontend", () => {
    const hosted = { siteUrl: "https://pilot.convex.site", stagingEmail: "owner@example.test" };
    expect(() => authorizeEmail("pilot@example.test", {
      ...hosted, commercialEnabled: false,
    })).toThrow(/restrita/i);
    expect(authorizeEmail("Pilot@Example.Test", {
      ...hosted, commercialEnabled: true,
    })).toBe("pilot@example.test");
  });
});
