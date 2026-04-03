#!/usr/bin/env node
/**
 * MALV local dev preflight: expected services, resolved ports, conflicts, and next steps.
 * Sources: .env (repo root), process.env, apps/web/vite.config.ts, app defaults.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const net = require("net");
const { execSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");

/** Defaults when not in env (see app main.ts files, vite.config.ts, beast-worker package.json) */
const FALLBACK = {
  WEB_PORT: 5173,
  API_PORT: 8080,
  SUPERVISOR_PORT: 8090,
  BEAST_PORT: 9090
};

function readFileSafe(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

/** Minimal KEY=VAL parser (no multiline values). */
function parseEnvFile(content) {
  const out = {};
  if (!content) return out;
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function parsePortFromViteConfig() {
  const raw = readFileSafe(path.join(REPO_ROOT, "apps/web/vite.config.ts"));
  if (!raw) return FALLBACK.WEB_PORT;
  const m = raw.match(/\bport\s*:\s*(\d+)/);
  return m ? Number(m[1]) : FALLBACK.WEB_PORT;
}

function parsePortFromUrl(urlStr, fallback) {
  if (!urlStr || typeof urlStr !== "string") return fallback;
  try {
    const u = new URL(urlStr);
    return u.port ? Number(u.port) : fallback;
  } catch {
    return fallback;
  }
}

/** What `npm run dev -w @malv/beast-worker` binds (scripts/run-uvicorn-beast.cjs + BEAST_WORKER_PORT). */
function parsePortFromBeastPackageJson(env) {
  if (env && env.BEAST_WORKER_PORT != null && String(env.BEAST_WORKER_PORT) !== "") {
    return toPort(env.BEAST_WORKER_PORT, FALLBACK.BEAST_PORT);
  }
  const raw = readFileSafe(path.join(REPO_ROOT, "apps/beast-worker/package.json"));
  if (!raw) return FALLBACK.BEAST_PORT;
  const m = raw.match(/--port\s+(\d+)/);
  return m ? Number(m[1]) : FALLBACK.BEAST_PORT;
}

/**
 * Merge precedence: .env.example < .env < process.env (shell wins).
 */
function resolveEnv() {
  const example = parseEnvFile(readFileSafe(path.join(REPO_ROOT, ".env.example")));
  const dotenv = parseEnvFile(readFileSafe(path.join(REPO_ROOT, ".env")));
  const merged = { ...example, ...dotenv };
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && v !== "") merged[k] = v;
  }
  return merged;
}

function toPort(n, fallback) {
  const x = Number(n);
  return Number.isFinite(x) && x > 0 && x < 65536 ? x : fallback;
}

function buildServices(env) {
  const vitePort = parsePortFromViteConfig();
  /** Vite binds this unless you pass `npm run dev -w @malv/web -- --port`. Root `.env` WEB_PORT is not loaded by Vite unless wired in vite.config / envDir. */
  const webPort = vitePort;

  const beastScriptPort = parsePortFromBeastPackageJson(env);
  const beastUrlPort = parsePortFromUrl(env.BEAST_WORKER_BASE_URL, beastScriptPort);

  return [
    {
      id: "web",
      label: "@malv/web (Vite dev server)",
      port: webPort,
      webEnvPort: env.WEB_PORT != null && String(env.WEB_PORT) !== "" ? toPort(env.WEB_PORT, vitePort) : null,
      portSource: `apps/web/vite.config.ts server.port (${vitePort}); override with CLI --port`,
      overrideExamples: [
        `npm run dev -w @malv/web -- --port ${webPort === 5173 ? 5174 : 5173}`,
        "Edit apps/web/vite.config.ts server.port for a permanent default"
      ]
    },
    {
      id: "api",
      label: "@malv/api (NestJS)",
      port: toPort(env.API_PORT, FALLBACK.API_PORT),
      portSource:
        env.API_PORT != null && String(env.API_PORT) !== ""
          ? "API_PORT from env (.env / shell)"
          : "apps/api/src/main.ts default 8080 (API_PORT in .env / .env.example)",
      overrideExamples: [`API_PORT=${toPort(env.API_PORT, FALLBACK.API_PORT) === 8080 ? 8081 : 8080} npm run dev:api`]
    },
    {
      id: "beast-worker",
      label: "@malv/beast-worker (Uvicorn / FastAPI)",
      port: beastScriptPort,
      portSource: `scripts/run-uvicorn-beast.cjs + BEAST_WORKER_PORT (default ${beastScriptPort})`,
      beastUrlPortMismatch: beastUrlPort !== beastScriptPort,
      beastUrlPort,
      overrideExamples: [
        `BEAST_WORKER_PORT=${beastScriptPort === 9090 ? 9091 : 9090} npm run dev:beast`,
        "Keep BEAST_WORKER_BASE_URL in .env aligned with BEAST_WORKER_PORT"
      ]
    },
    {
      id: "supervisor",
      label: "@malv/supervisor (NestJS)",
      port: toPort(env.SUPERVISOR_PORT, FALLBACK.SUPERVISOR_PORT),
      portSource:
        env.SUPERVISOR_PORT != null && String(env.SUPERVISOR_PORT) !== ""
          ? "SUPERVISOR_PORT from env (.env / shell)"
          : "apps/supervisor/src/main.ts default 8090 (SUPERVISOR_BASE_URL in .env.example)",
      overrideExamples: [
        `SUPERVISOR_PORT=${toPort(env.SUPERVISOR_PORT, FALLBACK.SUPERVISOR_PORT) === 8090 ? 8091 : 8090} npm run dev:supervisor`
      ]
    }
  ];
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", (err) => {
      if (err && err.code === "EADDRINUSE") resolve({ free: false, code: err.code });
      else resolve({ free: false, code: err?.code || "UNKNOWN", err });
    });
    srv.once("listening", () => {
      srv.close(() => resolve({ free: true }));
    });
    srv.listen(port, "0.0.0.0");
  });
}

function lsofListeners(port) {
  try {
    const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN 2>/dev/null`, {
      encoding: "utf8",
      maxBuffer: 1024 * 1024
    });
    const lines = out.trim().split("\n").filter(Boolean);
    if (lines.length < 2) return [];
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].trim().split(/\s+/);
      const command = parts[0];
      const pid = parts[1];
      if (pid && /^\d+$/.test(pid)) rows.push({ command, pid, raw: lines[i] });
    }
    return rows;
  } catch {
    return [];
  }
}

function printHeader(title) {
  const line = "─".repeat(Math.max(40, title.length + 4));
  console.log(`\n${line}\n  ${title}\n${line}`);
}

async function main() {
  const skip = process.env.SKIP_DEV_PREFLIGHT === "1" || process.env.SKIP_DEV_PREFLIGHT === "true";
  if (skip) {
    console.log("[dev-doctor] SKIP_DEV_PREFLIGHT set — skipping port checks.\n");
    process.exit(0);
  }

  const env = resolveEnv();
  const services = buildServices(env);

  printHeader("MALV dev preflight");
  console.log(
    "Resolved ports for this machine (shell env overrides .env). " +
      "Full stack: npm run dev (web + api + beast-worker + supervisor).\n"
  );

  const byPort = new Map();
  for (const s of services) {
    if (!byPort.has(s.port)) byPort.set(s.port, []);
    byPort.get(s.port).push(s.id);
  }

  const duplicatePorts = [...byPort.entries()].filter(([, ids]) => ids.length > 1);
  if (duplicatePorts.length > 0) {
    printHeader("Configuration error: two services share the same port");
    for (const [port, ids] of duplicatePorts) {
      console.log(`  Port ${port}: ${ids.join(", ")}`);
    }
    console.log(
      "\n  Fix: give each service a distinct port via .env (API_PORT, SUPERVISOR_PORT, WEB_PORT, BEAST_WORKER_BASE_URL) or overrides above.\n"
    );
    process.exit(1);
  }

  let hasConflict = false;

  for (const s of services) {
    printHeader(s.label);
    console.log(`  Intended port: ${s.port}`);
    console.log(`  Source: ${s.portSource}`);
    if (s.beastUrlPortMismatch) {
      console.log(
        `  Warning: BEAST_WORKER_BASE_URL in env implies port ${s.beastUrlPort}, but the dev script listens on ${s.port}. ` +
          `Update .env or apps/beast-worker/package.json so they match (otherwise the API may call the wrong host/port).`
      );
    }
    if (s.id === "web" && s.webEnvPort != null && s.webEnvPort !== s.port) {
      console.log(
        `  Note: .env has WEB_PORT=${s.webEnvPort} but Vite uses ${s.port} from vite.config.ts (root .env is not auto-loaded in apps/web unless you set envDir). ` +
          `This check uses the Vite config port.`
      );
    }

    const result = await isPortFree(s.port);
    if (result.free) {
      console.log("  Status: free (nothing listening on this port for this check)");
      console.log("  Note: If a service still crashes, read its log line in the concurrently output (DB, imports, etc.).");
    } else {
      hasConflict = true;
      console.log("  Status: occupied — another process is already listening (EADDRINUSE risk).");
      console.log("  Likely cause: stale dev server, another MALV terminal, or another app using this port.");
      const listeners = lsofListeners(s.port);
      if (listeners.length > 0) {
        console.log("  Process(es) using this port:");
        for (const L of listeners) {
          console.log(`    PID ${L.pid}  ${L.command}`);
          console.log(`      kill ${L.pid}`);
          console.log(`      kill -9 ${L.pid}   # if graceful kill does not work`);
        }
      } else {
        console.log("  (Could not list process with lsof — run manually:)");
        console.log(`    lsof -nP -iTCP:${s.port} -sTCP:LISTEN`);
      }
      console.log("\n  To use a different port instead:");
      for (const line of s.overrideExamples) {
        console.log(`    ${line}`);
      }
    }
    console.log("");
  }

  printHeader("Quick reference");
  console.log("  Full stack:     npm run dev");
  console.log("  Skip preflight: SKIP_DEV_PREFLIGHT=1 npm run dev");
  console.log("  Raw concurrent: npm run dev:raw");
  console.log("  Single service: npm run dev -w @malv/web|@malv/api|@malv/beast-worker|@malv/supervisor");
  console.log("  Diagnose only:  npm run dev:check\n");

  if (hasConflict) {
    printHeader("Preflight failed");
    console.log(
      "At least one intended port is already in use. Stop the listed PID(s), change ports in .env, " +
        "or use the override commands above. Then run npm run dev again.\n"
    );
    process.exit(1);
  }

  printHeader("Preflight OK");
  console.log("No port conflicts detected for the resolved configuration. Starting dev servers next.\n");
  process.exit(0);
}

main().catch((e) => {
  console.error("[dev-doctor] Unexpected error:", e);
  process.exit(1);
});
