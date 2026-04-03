/**
 * Centralized production security / secrets validation and redaction-safe reporting.
 * Used at bootstrap and by admin security posture endpoints.
 */

export type ProductionSecurityValidationArgs = { isProd: boolean; corsOrigins: string[] };

export function validateSandboxIsolationConfigOrThrow(args: { isProd: boolean }): void {
  const provider = (process.env.SANDBOX_ISOLATION_PROVIDER ?? "local").toLowerCase();
  if (!["local", "docker"].includes(provider)) {
    throw new Error("Invalid SANDBOX_ISOLATION_PROVIDER. Allowed values: local, docker.");
  }
  if (args.isProd && provider !== "docker") {
    throw new Error("Production requires SANDBOX_ISOLATION_PROVIDER=docker.");
  }
}

/** Placeholder / example values that must not ship in production for critical secrets. */
const PLACEHOLDER_PATTERNS = [
  /^change-me/i,
  /^changeme/i,
  /^example/i,
  /^your[-_]?/i,
  /^replace[-_]?/i,
  /^todo/i,
  /^secret$/i,
  /^password$/i,
  /^test$/i
];

export function looksLikePlaceholderSecret(value: string | undefined | null): boolean {
  const v = (value ?? "").trim();
  if (!v) return true;
  if (v.length < 16) return true;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(v));
}

export type SecretsValidationSummary = {
  ok: boolean;
  failures: string[];
  groups: {
    jwt: { ok: boolean; detail: string };
    database: { ok: boolean; detail: string };
    vault: { ok: boolean; detail: string };
    redisRateLimit: { ok: boolean; detail: string };
  };
};

/**
 * Validates required secret/config groups for production. Does not expose raw values.
 */
export function validateProductionSecretsGroupsOrThrow(args: { isProd: boolean }): SecretsValidationSummary {
  const failures: string[] = [];
  const jwtSecret = (process.env.JWT_ACCESS_SECRET ?? "").trim();
  const jwtOk = jwtSecret.length >= 32 && !looksLikePlaceholderSecret(jwtSecret) && !jwtSecret.toLowerCase().includes("change-me");
  if (!jwtOk) failures.push("JWT_ACCESS_SECRET must be at least 32 chars and not a placeholder.");

  const dbOk = Boolean((process.env.DB_HOST ?? "").trim()) && Boolean((process.env.DB_USER ?? "").trim()) && Boolean((process.env.DB_NAME ?? "").trim());
  if (!dbOk) failures.push("DB_HOST, DB_USER, and DB_NAME are required.");

  const vault = (process.env.MALV_VAULT_MASTER_KEY ?? "").trim();
  const vaultOk = vault.length >= 16 && !looksLikePlaceholderSecret(vault);
  if (!vaultOk) failures.push("MALV_VAULT_MASTER_KEY must be configured with a strong non-placeholder value.");

  const redisUrl = (process.env.REDIS_RATE_LIMIT_URL ?? process.env.REDIS_URL ?? "").trim();
  const redisOk = redisUrl.length > 0;
  if (!redisOk) failures.push("REDIS_RATE_LIMIT_URL or REDIS_URL must be set for rate limiting in production.");

  const summary: SecretsValidationSummary = {
    ok: failures.length === 0,
    failures,
    groups: {
      jwt: { ok: jwtOk, detail: jwtOk ? "configured" : "invalid_or_placeholder" },
      database: { ok: dbOk, detail: dbOk ? "configured" : "missing_required_fields" },
      vault: { ok: vaultOk, detail: vaultOk ? "configured" : "missing_or_weak" },
      redisRateLimit: { ok: redisOk, detail: redisOk ? "configured" : "missing" }
    }
  };

  if (args.isProd && failures.length > 0) {
    throw new Error(`Production secrets validation failed: ${failures.join(" ")}`);
  }

  return summary;
}

export function validateProductionSecurityOrThrow(args: ProductionSecurityValidationArgs): void {
  validateSandboxIsolationConfigOrThrow({ isProd: args.isProd });
  if (!args.isProd) return;
  const failures: string[] = [];
  const sameSite = (process.env.AUTH_REFRESH_COOKIE_SAMESITE ?? "lax").toLowerCase();
  const secureCookie = (process.env.AUTH_REFRESH_COOKIE_SECURE ?? "").toLowerCase() === "true";
  const httpOnlyCookie = (process.env.AUTH_REFRESH_COOKIE_HTTP_ONLY ?? "true").toLowerCase() === "true";
  const storageLegacyRegisterEnabled = (process.env.MALV_ALLOW_LEGACY_STORAGE_URI_REGISTER ?? "false").toLowerCase() === "true";
  if (!secureCookie) {
    failures.push("AUTH_REFRESH_COOKIE_SECURE must be true in production.");
  }
  if (!httpOnlyCookie) {
    failures.push("AUTH_REFRESH_COOKIE_HTTP_ONLY must be true in production.");
  }
  if (sameSite === "none" && !secureCookie) {
    failures.push("AUTH_REFRESH_COOKIE_SAMESITE=none requires AUTH_REFRESH_COOKIE_SECURE=true.");
  }
  if (storageLegacyRegisterEnabled) {
    failures.push("MALV_ALLOW_LEGACY_STORAGE_URI_REGISTER must be false in production.");
  }
  if (args.corsOrigins.length < 1) {
    failures.push("At least one explicit CORS origin must be configured in production.");
  }
  if (args.corsOrigins.some((o) => o === "*")) {
    failures.push("Wildcard CORS origin is forbidden in production when credentials are enabled.");
  }
  const insecureCors = args.corsOrigins.filter((o) => /^http:\/\//i.test(o) || /localhost|127\.0\.0\.1/i.test(o));
  if (insecureCors.length > 0) {
    failures.push(`Insecure production CORS origins detected: ${insecureCors.join(", ")}`);
  }
  if (failures.length > 0) {
    throw new Error(`Production security configuration validation failed: ${failures.join(" ")}`);
  }
}

const SENSITIVE_KEY_SUBSTRINGS = [
  "SECRET",
  "PASSWORD",
  "TOKEN",
  "KEY",
  "API_KEY",
  "PRIVATE",
  "CREDENTIAL",
  "AUTH",
  "VAULT_MASTER"
];

/**
 * Redacts env values for admin-safe diagnostics. Never returns raw secrets.
 */
export function redactEnvValue(key: string, value: string | undefined): string {
  const k = key.toUpperCase();
  const isSensitive = SENSITIVE_KEY_SUBSTRINGS.some((s) => k.includes(s));
  const v = value ?? "";
  if (!isSensitive) {
    return v.length > 200 ? `${v.slice(0, 200)}…` : v;
  }
  if (!v.trim()) return "(unset)";
  if (v.length <= 8) return "***";
  return `***(${v.length} chars)`;
}

export function buildRedactedEnvSnapshot(keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) {
    out[key] = redactEnvValue(key, process.env[key]);
  }
  return out;
}
