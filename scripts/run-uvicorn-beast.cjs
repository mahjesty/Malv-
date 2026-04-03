#!/usr/bin/env node
/**
 * Cross-platform dev runner for apps/beast-worker (no sh -c).
 * Loads repo root .env so BEAST_WORKER_PORT / BEAST_WORKER_BASE_URL match npm workspaces.
 */
"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const BEAST_DIR = path.join(REPO_ROOT, "apps", "beast-worker");

function loadEnvFile(p) {
  if (!fs.existsSync(p)) return;
  const text = fs.readFileSync(p, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile(path.join(REPO_ROOT, ".env"));

const port = String(process.env.BEAST_WORKER_PORT || "9090").trim() || "9090";
const isProd = process.argv.includes("--production");

const python =
  process.platform === "win32"
    ? process.env.PYTHON || "python"
    : process.env.PYTHON || "python3";

const args = ["-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", port];
if (!isProd) args.push("--reload");

const child = spawn(python, args, {
  cwd: BEAST_DIR,
  stdio: "inherit",
  env: { ...process.env, BEAST_WORKER_PORT: port }
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
