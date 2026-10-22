import { describe, expect, test } from "bun:test";
import { createPublicKey, createPrivateKey, verify, sign } from "node:crypto";
import { assessVariables, generateAuthKeys, validDeploymentName } from "../scripts/configure-staging-auth-keys.mjs";

describe("chaves Convex Auth e segurança de setup", () => {
  test("aceita nome real do deployment e recusa valores malformados", () => {
    expect(validDeploymentName("unique-tortoise-387")).toBe(true);
    expect(validDeploymentName("--prod")).toBe(false);
    expect(validDeploymentName("dev team")).toBe(false);
    expect(validDeploymentName("https://any.convex.cloud")).toBe(false);
    expect(validDeploymentName("")).toBe(false);
  });

  test("gera chave PKCS8 e JWKS RS256 correspondente", () => {
    const { JWT_PRIVATE_KEY, JWKS } = generateAuthKeys();
    const jwk = JSON.parse(JWKS).keys[0];
    expect(jwk.kty).toBe("RSA");
    expect(jwk.use).toBe("sig");
    expect(JWT_PRIVATE_KEY.includes("BEGIN PRIVATE KEY")).toBe(true);
    expect(JWT_PRIVATE_KEY.includes("\n")).toBe(false);

    const pem = JWT_PRIVATE_KEY
      .replace("-----BEGIN PRIVATE KEY----- ", "-----BEGIN PRIVATE KEY-----\n")
      .replace(" -----END PRIVATE KEY-----", "\n-----END PRIVATE KEY-----")
      .replace(/(.{64})(?=.)/g, "$1\n"); // apenas como sanity check de formato
    expect(typeof pem).toBe("string");
    expect(typeof createPrivateKey).toBe("function");
    const publicKey = createPublicKey({ key: jwk, format: "jwk" });
    expect(publicKey.asymmetricKeyType).toBe("rsa");
    const sample = Buffer.from("barber-os-staging-test");
    const fromPem = JWT_PRIVATE_KEY.replace(/-----BEGIN PRIVATE KEY-----\s*/, "-----BEGIN PRIVATE KEY-----\n")
      .replace(/\s*-----END PRIVATE KEY-----/, "\n-----END PRIVATE KEY-----");
    const signature = sign("RSA-SHA256", sample, createPrivateKey(fromPem));
    expect(verify("RSA-SHA256", sample, publicKey, signature)).toBe(true);
  });

  test("exige variáveis Resend previamente configuradas", () => {
    expect(assessVariables(new Set()).missingRequired).toEqual([
      "RESEND_API_KEY",
      "RESEND_FROM_EMAIL",
      "BARBER_STAGING_EMAIL",
    ]);
    const status = assessVariables(new Set(["RESEND_API_KEY", "RESEND_FROM_EMAIL", "BARBER_STAGING_EMAIL"]));
    expect(status.missingRequired).toEqual([]);
    expect(status.presentKeys).toEqual([]);
  });

  test("identifica par de chaves completo ou incompleto", () => {
    expect(assessVariables(new Set(["JWT_PRIVATE_KEY"])).presentKeys).toEqual(["JWT_PRIVATE_KEY"]);
    expect(assessVariables(new Set(["JWT_PRIVATE_KEY", "JWKS"])).presentKeys).toEqual(["JWT_PRIVATE_KEY", "JWKS"]);
  });
});
