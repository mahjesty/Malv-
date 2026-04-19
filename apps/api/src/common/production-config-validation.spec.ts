import {
  buildRedactedEnvSnapshot,
  looksLikePlaceholderSecret,
  redactEnvValue,
  validateDistributedSafetyOrThrow,
  validateProductionSecretsGroupsOrThrow,
  validateProductionSecurityOrThrow
} from "./production-config-validation";

describe("production-config-validation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("redacts sensitive env keys and never exposes raw secrets", () => {
    process.env.JWT_ACCESS_SECRET = "super-secret-value-that-is-long-enough";
    process.env.DB_PASSWORD = "x";
    expect(redactEnvValue("JWT_ACCESS_SECRET", process.env.JWT_ACCESS_SECRET)).toContain("***");
    expect(redactEnvValue("JWT_ACCESS_SECRET", process.env.JWT_ACCESS_SECRET)).not.toContain("super-secret");
    expect(redactEnvValue("DB_PASSWORD", process.env.DB_PASSWORD)).toBe("***");
    const snap = buildRedactedEnvSnapshot(["JWT_ACCESS_SECRET", "NODE_ENV"]);
    expect(snap.JWT_ACCESS_SECRET).toMatch(/\*\*\*/);
  });

  it("detects placeholder secrets", () => {
    expect(looksLikePlaceholderSecret("change-me-access-secret")).toBe(true);
    expect(looksLikePlaceholderSecret("a".repeat(40))).toBe(false);
  });

  it("startup validation still fails appropriately in production when secrets are missing", () => {
    process.env.SANDBOX_ISOLATION_PROVIDER = "docker";
    process.env.AUTH_REFRESH_COOKIE_SECURE = "true";
    process.env.AUTH_REFRESH_COOKIE_HTTP_ONLY = "true";
    process.env.AUTH_REFRESH_COOKIE_SAMESITE = "lax";
    process.env.MALV_ALLOW_LEGACY_STORAGE_URI_REGISTER = "false";
    process.env.JWT_ACCESS_SECRET = "x".repeat(40);
    process.env.DB_HOST = "h";
    process.env.DB_USER = "u";
    process.env.DB_NAME = "n";
    process.env.MALV_VAULT_MASTER_KEY = "y".repeat(20);
    process.env.REDIS_RATE_LIMIT_URL = "redis://127.0.0.1:6379";
    expect(() => validateProductionSecretsGroupsOrThrow({ isProd: true })).not.toThrow();
    delete process.env.REDIS_RATE_LIMIT_URL;
    delete process.env.REDIS_URL;
    expect(() => validateProductionSecretsGroupsOrThrow({ isProd: true })).toThrow(/Production secrets validation failed/);
  });

  it("validateProductionSecurityOrThrow still enforces cors and cookies in production", () => {
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

  it("fails multi-instance safety when distributed prerequisites are missing", () => {
    process.env.MALV_DEPLOYMENT_MODE = "multi_instance";
    process.env.REDIS_COORDINATION_URL = "";
    process.env.REDIS_URL = "";
    process.env.REDIS_SOCKET_IO_ADAPTER_URL = "";
    process.env.MALV_STORAGE_BACKEND = "local_private";
    process.env.MALV_SHARED_FILESYSTEM_CONFIRMED = "false";
    process.env.BEAST_WORKER_BASE_URL = "";
    process.env.BEAST_WORKER_BASE_URLS = "";
    expect(() => validateDistributedSafetyOrThrow({ isProd: true, env: process.env })).toThrow(
      /Distributed deployment validation failed/
    );
  });
});
