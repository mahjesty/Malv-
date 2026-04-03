import { validateProductionSecurityOrThrow } from "./main";

describe("production security config enforcement", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("fails on insecure production cookie and cors posture", () => {
    process.env.SANDBOX_ISOLATION_PROVIDER = "docker";
    process.env.AUTH_REFRESH_COOKIE_SECURE = "false";
    process.env.AUTH_REFRESH_COOKIE_HTTP_ONLY = "false";
    process.env.AUTH_REFRESH_COOKIE_SAMESITE = "none";
    process.env.MALV_ALLOW_LEGACY_STORAGE_URI_REGISTER = "true";
    expect(() =>
      validateProductionSecurityOrThrow({
        isProd: true,
        corsOrigins: ["http://localhost:3000", "*"]
      })
    ).toThrow(/Production security configuration validation failed/);
  });

  it("accepts strict production configuration", () => {
    process.env.SANDBOX_ISOLATION_PROVIDER = "docker";
    process.env.AUTH_REFRESH_COOKIE_SECURE = "true";
    process.env.AUTH_REFRESH_COOKIE_HTTP_ONLY = "true";
    process.env.AUTH_REFRESH_COOKIE_SAMESITE = "lax";
    process.env.MALV_ALLOW_LEGACY_STORAGE_URI_REGISTER = "false";
    expect(() =>
      validateProductionSecurityOrThrow({
        isProd: true,
        corsOrigins: ["https://app.example.com"]
      })
    ).not.toThrow();
  });

  it("blocks any non-docker sandbox isolation in production", () => {
    process.env.SANDBOX_ISOLATION_PROVIDER = "local";
    process.env.AUTH_REFRESH_COOKIE_SECURE = "true";
    process.env.AUTH_REFRESH_COOKIE_HTTP_ONLY = "true";
    process.env.AUTH_REFRESH_COOKIE_SAMESITE = "lax";
    process.env.MALV_ALLOW_LEGACY_STORAGE_URI_REGISTER = "false";
    expect(() =>
      validateProductionSecurityOrThrow({
        isProd: true,
        corsOrigins: ["https://app.example.com"]
      })
    ).toThrow(/Production requires SANDBOX_ISOLATION_PROVIDER=docker/);
  });

  it("fails production validation when sandbox provider is missing", () => {
    delete process.env.SANDBOX_ISOLATION_PROVIDER;
    process.env.AUTH_REFRESH_COOKIE_SECURE = "true";
    process.env.AUTH_REFRESH_COOKIE_HTTP_ONLY = "true";
    process.env.AUTH_REFRESH_COOKIE_SAMESITE = "lax";
    process.env.MALV_ALLOW_LEGACY_STORAGE_URI_REGISTER = "false";
    expect(() =>
      validateProductionSecurityOrThrow({
        isProd: true,
        corsOrigins: ["https://app.example.com"]
      })
    ).toThrow(/Production requires SANDBOX_ISOLATION_PROVIDER=docker/);
  });

  it("fails validation on invalid sandbox provider value", () => {
    process.env.SANDBOX_ISOLATION_PROVIDER = "podman";
    expect(() =>
      validateProductionSecurityOrThrow({
        isProd: true,
        corsOrigins: ["https://app.example.com"]
      })
    ).toThrow(/Invalid SANDBOX_ISOLATION_PROVIDER/);
  });
});
