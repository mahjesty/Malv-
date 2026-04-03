#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseBool(value, fallback = false) {
  if (value == null || value === "") return fallback;
  const v = String(value).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function redactEmail(email) {
  const at = email.indexOf("@");
  if (at <= 1) return "***";
  return `${email.slice(0, 1)}***${email.slice(at - 1)}`;
}

function metricValue(metricsText, metricName, labels = null) {
  const lines = String(metricsText || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  for (const line of lines) {
    if (!line.startsWith(metricName)) continue;
    if (labels) {
      const braceStart = line.indexOf("{");
      const braceEnd = line.indexOf("}");
      if (braceStart < 0 || braceEnd < braceStart) continue;
      const labelPart = line.slice(braceStart + 1, braceEnd);
      const expected = Object.entries(labels).every(([k, v]) => labelPart.includes(`${k}="${v}"`));
      if (!expected) continue;
      const val = Number(line.slice(braceEnd + 1).trim());
      return Number.isFinite(val) ? val : null;
    }
    const val = Number(line.split(/\s+/).at(-1));
    return Number.isFinite(val) ? val : null;
  }
  return null;
}

function pickMetricSnapshot(metricsText) {
  return {
    rateLimitBlocked: metricValue(metricsText, "malv_rate_limit_events_total", { outcome: "blocked" }),
    authFailures: metricValue(metricsText, "malv_auth_failures_total"),
    wsDisconnects: metricValue(metricsText, "malv_websocket_disconnects_total"),
    uploadHandleMode: metricValue(metricsText, "malv_upload_register_path_total", { mode: "upload_handle" }),
    legacyStoragePath: metricValue(metricsText, "malv_legacy_path_usage_total", { path: "file_register_storage_uri" }),
    legacyRefreshFallback: metricValue(metricsText, "malv_legacy_path_usage_total", { path: "refresh_body_fallback" }),
    vaultMigrations: metricValue(metricsText, "malv_vault_plaintext_migrations_total"),
    recapFailures: metricValue(metricsText, "malv_recap_failures_total"),
    videoFailures: metricValue(metricsText, "malv_video_processing_failures_total")
  };
}

function flowStatusFromSteps(steps) {
  if (steps.some((s) => s.status === "failed")) return "failed";
  if (steps.some((s) => s.status === "skipped")) return "partial";
  return "passed";
}

class Runner {
  constructor(config) {
    this.config = config;
    this.cookies = new Map();
    this.steps = [];
    this.context = {
      userA: { accessToken: null, userId: null, email: config.userAEmail, password: config.userAPassword },
      userB: { accessToken: null, userId: null, email: config.userBEmail, password: config.userBPassword },
      conversationId: null,
      roomId: null,
      workspaceId: null,
      fileId: null,
      callSessionId: null
    };
    this.metricsBeforeText = "";
    this.metricsAfterText = "";
  }

  async runStep(name, fn, options = {}) {
    const started = Date.now();
    const row = {
      name,
      flow: options.flow ?? "general",
      status: "passed",
      startedAt: new Date(started).toISOString(),
      endedAt: "",
      durationMs: 0,
      details: {}
    };
    try {
      const details = await fn();
      row.details = details ?? {};
      if (options.expectSkipped === true) row.status = "skipped";
    } catch (err) {
      row.status = options.allowFailure ? "skipped" : "failed";
      row.details = {
        error: err instanceof Error ? err.message : String(err),
        stack: this.config.includeStacks && err instanceof Error ? err.stack : undefined
      };
    }
    row.endedAt = new Date().toISOString();
    row.durationMs = Date.now() - started;
    this.steps.push(row);
    return row;
  }

  cookieHeader() {
    if (this.cookies.size === 0) return "";
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("; ");
  }

  updateCookies(setCookieHeaders) {
    for (const header of setCookieHeaders ?? []) {
      const first = String(header).split(";")[0];
      const idx = first.indexOf("=");
      if (idx <= 0) continue;
      const key = first.slice(0, idx).trim();
      const val = first.slice(idx + 1).trim();
      if (!key) continue;
      this.cookies.set(key, val);
    }
  }

  async request(method, endpoint, opts = {}) {
    const url = `${this.config.baseUrl}${endpoint}`;
    const headers = { Accept: "application/json", ...(opts.headers ?? {}) };
    if (!opts.rawBody && !headers["Content-Type"] && opts.body != null && !(opts.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }
    if (!opts.noCookies) {
      const cookie = this.cookieHeader();
      if (cookie) headers.Cookie = cookie;
    }
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    const started = Date.now();
    const res = await fetch(url, {
      method,
      headers,
      body:
        opts.body == null
          ? undefined
          : opts.rawBody
            ? opts.body
            : opts.body instanceof FormData
              ? opts.body
              : JSON.stringify(opts.body)
    });
    this.updateCookies(res.headers.getSetCookie?.() ?? []);
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return {
      ok: res.ok,
      status: res.status,
      url,
      durationMs: Date.now() - started,
      headers: Object.fromEntries(res.headers.entries()),
      text,
      json
    };
  }

  assertOk(res, message) {
    if (!res.ok) {
      const suffix = res.json ? JSON.stringify(res.json) : res.text;
      throw new Error(`${message} (status=${res.status}) ${suffix}`);
    }
  }

  async authLogin(user) {
    const res = await this.request("POST", "/v1/auth/login", {
      body: { email: user.email, password: user.password },
      noCookies: true
    });
    this.assertOk(res, `login failed for ${user.email}`);
    if (!res.json?.accessToken) throw new Error("login response missing accessToken");
    return { accessToken: res.json.accessToken };
  }

  async authSignupOrLogin(user, flow) {
    const signup = await this.request("POST", "/v1/auth/signup", {
      body: { email: user.email, password: user.password, displayName: user.displayName },
      noCookies: true
    });
    if (signup.ok && signup.json?.accessToken) {
      return { mode: "signup", accessToken: signup.json.accessToken };
    }
    const login = await this.authLogin(user);
    return { mode: "login", accessToken: login.accessToken };
  }

  async run() {
    await this.runStep(
      "metrics.preflight",
      async () => {
        const res = await this.request("GET", "/v1/metrics", { noCookies: true });
        this.assertOk(res, "metrics endpoint not reachable");
        this.metricsBeforeText = res.text;
        return { metricLines: res.text.split("\n").length };
      },
      { flow: "metrics" }
    );

    await this.runStep(
      "auth.signup_or_login.userA",
      async () => {
        const out = await this.authSignupOrLogin(
          { email: this.context.userA.email, password: this.context.userA.password, displayName: this.config.userADisplayName },
          "auth"
        );
        this.context.userA.accessToken = out.accessToken;
        return { mode: out.mode, email: redactEmail(this.context.userA.email) };
      },
      { flow: "auth" }
    );

    await this.runStep(
      "auth.me.bootstrap.userA",
      async () => {
        const res = await this.request("GET", "/v1/auth/me", { token: this.context.userA.accessToken, noCookies: true });
        this.assertOk(res, "auth/me failed for userA");
        if (!res.json?.ok || !res.json?.userId) throw new Error("auth/me missing userId");
        this.context.userA.userId = res.json.userId;
        return { role: res.json.role ?? null, permissionsCount: Array.isArray(res.json.permissions) ? res.json.permissions.length : 0 };
      },
      { flow: "auth" }
    );

    await this.runStep(
      "auth.signup_or_login.userB",
      async () => {
        const out = await this.authSignupOrLogin(
          { email: this.context.userB.email, password: this.context.userB.password, displayName: this.config.userBDisplayName },
          "auth"
        );
        this.context.userB.accessToken = out.accessToken;
        return { mode: out.mode, email: redactEmail(this.context.userB.email) };
      },
      { flow: "auth" }
    );

    await this.runStep(
      "auth.me.bootstrap.userB",
      async () => {
        const res = await this.request("GET", "/v1/auth/me", { token: this.context.userB.accessToken, noCookies: true });
        this.assertOk(res, "auth/me failed for userB");
        this.context.userB.userId = res.json?.userId ?? null;
        return { role: res.json?.role ?? null };
      },
      { flow: "auth" }
    );

    await this.runStep(
      "auth.refresh.cookie_and_logout",
      async () => {
        this.cookies.clear();
        const login = await this.request("POST", "/v1/auth/login", {
          body: { email: this.context.userA.email, password: this.context.userA.password }
        });
        this.assertOk(login, "cookie login failed");
        const refresh = await this.request("POST", "/v1/auth/refresh", { body: {} });
        this.assertOk(refresh, "refresh failed");
        const logout = await this.request("POST", "/v1/auth/logout", { body: {} });
        this.assertOk(logout, "logout failed");
        return { refreshed: Boolean(refresh.json?.accessToken), cookieCount: this.cookies.size };
      },
      { flow: "auth" }
    );

    await this.runStep(
      "auth.password_reset_stale_session_rejection",
      async () => {
        const loginBefore = await this.request("POST", "/v1/auth/login", {
          body: { email: this.context.userA.email, password: this.context.userA.password },
          noCookies: true
        });
        this.assertOk(loginBefore, "pre-reset login failed");
        const staleAccessToken = loginBefore.json?.accessToken;
        const forgot = await this.request("POST", "/v1/auth/forgot-password", {
          body: { email: this.context.userA.email },
          noCookies: true
        });
        this.assertOk(forgot, "forgot-password failed");
        if (!this.config.passwordResetToken) {
          return {
            skipped: true,
            reason: "MALV_SMOKE_PASSWORD_RESET_TOKEN not set; cannot complete reset+revoke verification in black-box mode"
          };
        }
        const reset = await this.request("POST", "/v1/auth/reset-password", {
          body: { token: this.config.passwordResetToken, password: this.config.userANewPassword },
          noCookies: true
        });
        this.assertOk(reset, "reset-password failed");
        this.context.userA.password = this.config.userANewPassword;
        const staleRefresh = await this.request("POST", "/v1/auth/refresh", {
          body: { refreshToken: loginBefore.json?.refreshToken ?? "missing" },
          noCookies: true
        });
        const staleMe = await this.request("GET", "/v1/auth/me", { token: staleAccessToken, noCookies: true });
        if (staleRefresh.ok) throw new Error("stale refresh unexpectedly succeeded after reset");
        if (staleMe.ok) throw new Error("stale access token unexpectedly succeeded after reset");
        const relogin = await this.authLogin(this.context.userA);
        this.context.userA.accessToken = relogin.accessToken;
        return { staleRefreshStatus: staleRefresh.status, staleMeStatus: staleMe.status };
      },
      { flow: "auth", allowFailure: false }
    );
    if (this.steps.at(-1)?.details?.skipped) this.steps.at(-1).status = "skipped";

    await this.runStep(
      "rooms.create_and_isolation",
      async () => {
        const create = await this.request("POST", "/v1/rooms", {
          token: this.context.userA.accessToken,
          noCookies: true,
          body: { title: `smoke-room-${Date.now()}` }
        });
        this.assertOk(create, "room creation failed");
        const roomId = create.json?.room?.id;
        if (!roomId) throw new Error("missing roomId");
        this.context.roomId = roomId;
        const outsiderGet = await this.request("GET", `/v1/rooms/${roomId}`, {
          token: this.context.userB.accessToken,
          noCookies: true
        });
        if (outsiderGet.ok) throw new Error("room isolation failed: userB accessed room before membership");
        const add = await this.request("POST", `/v1/rooms/${roomId}/members`, {
          token: this.context.userA.accessToken,
          noCookies: true,
          body: { userId: this.context.userB.userId }
        });
        this.assertOk(add, "add member failed");
        const nowAllowed = await this.request("GET", `/v1/rooms/${roomId}`, {
          token: this.context.userB.accessToken,
          noCookies: true
        });
        this.assertOk(nowAllowed, "userB still cannot access room after membership");
        return { roomId, outsiderStatusBeforeAdd: outsiderGet.status, memberAccessStatus: nowAllowed.status };
      },
      { flow: "rooms" }
    );

    await this.runStep(
      "workspace.tasks_and_approvals_surface",
      async () => {
        const wsCreate = await this.request("POST", "/v1/workspaces", {
          token: this.context.userA.accessToken,
          noCookies: true,
          body: { name: `smoke-ws-${Date.now()}` }
        });
        this.assertOk(wsCreate, "workspace create failed");
        this.context.workspaceId = wsCreate.json?.workspace?.id ?? null;
        const taskCreate = await this.request("POST", "/v1/workspaces/tasks", {
          token: this.context.userA.accessToken,
          noCookies: true,
          body: {
            title: "Launch smoke task",
            description: "Created by launch smoke runner",
            source: "manual",
            roomId: this.context.roomId
          }
        });
        this.assertOk(taskCreate, "task create failed");
        const approvalCreate = await this.request("POST", "/v1/workspaces/approvals", {
          token: this.context.userA.accessToken,
          noCookies: true,
          body: {
            actionDescription: "Launch smoke approval request",
            riskLevel: "low",
            source: "other",
            roomId: this.context.roomId
          }
        });
        this.assertOk(approvalCreate, "approval create failed");
        const surface = await this.request("GET", "/v1/workspaces/surface", { token: this.context.userA.accessToken, noCookies: true });
        this.assertOk(surface, "workspace surface failed");
        return {
          workspaceId: this.context.workspaceId,
          taskId: taskCreate.json?.task?.id ?? null,
          approvalId: approvalCreate.json?.approval?.id ?? null
        };
      },
      { flow: "workspace" }
    );

    await this.runStep(
      "chat.ask_malv_bootstrap",
      async () => {
        const chat = await this.request("POST", "/v1/chat", {
          token: this.context.userA.accessToken,
          noCookies: true,
          body: {
            message: "Smoke test: respond with one short sentence.",
            workspaceId: this.context.workspaceId
          }
        });
        this.assertOk(chat, "chat bootstrap failed");
        const convId = chat.json?.conversationId ?? chat.json?.conversation?.id ?? null;
        this.context.conversationId = convId;
        return { conversationId: convId, hasReply: typeof chat.json?.reply === "string" && chat.json.reply.length > 0 };
      },
      { flow: "chat" }
    );

    await this.runStep(
      "files.upload_register_process",
      async () => {
        const content = `MALV launch smoke file ${nowIso()} ${Math.random().toString(36).slice(2)}`;
        const form = new FormData();
        form.append("fileKind", "text");
        if (this.context.workspaceId) form.append("workspaceId", this.context.workspaceId);
        if (this.context.roomId) form.append("roomId", this.context.roomId);
        form.append("file", new Blob([content], { type: "text/plain" }), "launch-smoke.txt");
        const upload = await this.request("POST", "/v1/files/upload", {
          token: this.context.userA.accessToken,
          noCookies: true,
          body: form
        });
        this.assertOk(upload, "file upload failed");
        const fileId = upload.json?.fileId;
        if (!fileId) throw new Error("upload response missing fileId");
        this.context.fileId = fileId;
        const understand = await this.request("POST", `/v1/files/${fileId}/understand`, {
          token: this.context.userA.accessToken,
          noCookies: true,
          body: {
            conversationId: this.context.conversationId,
            requiresApproval: false,
            requestedMode: "cpu"
          }
        });
        this.assertOk(understand, "file understand enqueue failed");
        return { fileId, aiJobId: understand.json?.aiJobId ?? null };
      },
      { flow: "files" }
    );

    await this.runStep(
      "files.retrieve_then_ask_malv",
      async () => {
        if (!this.context.fileId) throw new Error("fileId missing");
        const retrieve = await this.request("POST", `/v1/files/${this.context.fileId}/retrieve`, {
          token: this.context.userA.accessToken,
          noCookies: true,
          body: { query: "What is in this smoke file?", topK: 3 }
        });
        this.assertOk(retrieve, "file retrieve failed");
        const ask = await this.request("POST", "/v1/chat", {
          token: this.context.userA.accessToken,
          noCookies: true,
          body: {
            conversationId: this.context.conversationId,
            workspaceId: this.context.workspaceId,
            message: "Using uploaded context, summarize the smoke file in one line."
          }
        });
        this.assertOk(ask, "follow-up chat failed");
        return { retrieveHits: Array.isArray(retrieve.json?.hits) ? retrieve.json.hits.length : null };
      },
      { flow: "files_chat" }
    );

    await this.runStep(
      "calls.recap_generation_path",
      async () => {
        const create = await this.request("POST", "/v1/calls", {
          token: this.context.userA.accessToken,
          noCookies: true,
          body: { kind: "voice", conversationId: this.context.conversationId, participationScope: "direct" }
        });
        this.assertOk(create, "call create failed");
        const callSessionId = create.json?.callSessionId;
        if (!callSessionId) throw new Error("missing callSessionId");
        this.context.callSessionId = callSessionId;
        const transcript = await this.request("POST", `/v1/calls/${callSessionId}/transcripts`, {
          token: this.context.userA.accessToken,
          noCookies: true,
          body: { speakerRole: "user", content: "Please create recap items for launch smoke.", startTimeMs: 0 }
        });
        this.assertOk(transcript, "add transcript failed");
        const end = await this.request("PATCH", `/v1/calls/${callSessionId}/state`, {
          token: this.context.userA.accessToken,
          noCookies: true,
          body: { status: "ended" }
        });
        this.assertOk(end, "end call failed");
        let recapReady = false;
        let recapKeys = [];
        for (let i = 0; i < this.config.callRecapPollAttempts; i++) {
          await sleep(this.config.callRecapPollIntervalMs);
          const call = await this.request("GET", `/v1/calls/${callSessionId}`, {
            token: this.context.userA.accessToken,
            noCookies: true
          });
          this.assertOk(call, "get call failed");
          const recap = call.json?.runtime?.recap ?? null;
          if (recap && typeof recap === "object" && Object.keys(recap).length > 0) {
            recapReady = true;
            recapKeys = Object.keys(recap);
            break;
          }
        }
        if (!recapReady) throw new Error("recap not materialized within poll window");
        return { callSessionId, recapKeys };
      },
      { flow: "calls" }
    );

    await this.runStep(
      "metrics.postflight_and_legacy_visibility",
      async () => {
        const res = await this.request("GET", "/v1/metrics", { noCookies: true });
        this.assertOk(res, "postflight metrics endpoint not reachable");
        this.metricsAfterText = res.text;
        const before = pickMetricSnapshot(this.metricsBeforeText);
        const after = pickMetricSnapshot(this.metricsAfterText);
        return { before, after };
      },
      { flow: "metrics" }
    );

    const flows = Array.from(new Set(this.steps.map((s) => s.flow)));
    const flowSummary = {};
    for (const flow of flows) {
      flowSummary[flow] = flowStatusFromSteps(this.steps.filter((s) => s.flow === flow));
    }
    const totals = {
      passed: this.steps.filter((s) => s.status === "passed").length,
      failed: this.steps.filter((s) => s.status === "failed").length,
      skipped: this.steps.filter((s) => s.status === "skipped").length
    };
    const overallStatus = totals.failed > 0 ? "failed" : totals.skipped > 0 ? "partial" : "passed";
    return {
      runner: "launch-smoke-runner",
      startedAt: this.steps[0]?.startedAt ?? nowIso(),
      endedAt: nowIso(),
      environment: {
        baseUrl: this.config.baseUrl,
        userAEmail: redactEmail(this.context.userA.email),
        userBEmail: redactEmail(this.context.userB.email),
        stagingMode: true
      },
      overallStatus,
      totals,
      flowSummary,
      steps: this.steps,
      evidence: {
        ids: {
          roomId: this.context.roomId,
          workspaceId: this.context.workspaceId,
          conversationId: this.context.conversationId,
          fileId: this.context.fileId,
          callSessionId: this.context.callSessionId
        },
        metricsBefore: pickMetricSnapshot(this.metricsBeforeText),
        metricsAfter: pickMetricSnapshot(this.metricsAfterText)
      }
    };
  }
}

function humanReport(summary) {
  const lines = [];
  lines.push(`MALV Launch Smoke Runner`);
  lines.push(`Status: ${summary.overallStatus.toUpperCase()}`);
  lines.push(`Base URL: ${summary.environment.baseUrl}`);
  lines.push(`Started: ${summary.startedAt}`);
  lines.push(`Ended: ${summary.endedAt}`);
  lines.push(`Totals: passed=${summary.totals.passed} failed=${summary.totals.failed} skipped=${summary.totals.skipped}`);
  lines.push("");
  lines.push("Flow Summary:");
  for (const [flow, status] of Object.entries(summary.flowSummary)) {
    lines.push(`- ${flow}: ${status}`);
  }
  lines.push("");
  lines.push("Step Results:");
  for (const step of summary.steps) {
    lines.push(`- [${step.status}] ${step.name} (${step.durationMs}ms)`);
    if (step.status !== "passed") {
      lines.push(`  details: ${JSON.stringify(step.details)}`);
    }
  }
  lines.push("");
  lines.push("Metrics Evidence (selected):");
  lines.push(`- before: ${JSON.stringify(summary.evidence.metricsBefore)}`);
  lines.push(`- after:  ${JSON.stringify(summary.evidence.metricsAfter)}`);
  lines.push("");
  lines.push("Resource IDs:");
  lines.push(`- ${JSON.stringify(summary.evidence.ids)}`);
  return lines.join("\n");
}

async function main() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = process.env.MALV_SMOKE_OUTPUT_DIR || path.resolve(process.cwd(), "artifacts", "launch-smoke");
  const baseUrl = (process.env.MALV_SMOKE_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("MALV_SMOKE_BASE_URL is required.");
  }
  const userAEmail =
    process.env.MALV_SMOKE_USER_EMAIL ||
    process.env.MALV_SMOKE_USER_A_EMAIL ||
    `launch-smoke-a+${Date.now()}@example.test`;
  const userAPassword = process.env.MALV_SMOKE_USER_PASSWORD || process.env.MALV_SMOKE_USER_A_PASSWORD || "ChangeMe_12345!";
  const userBEmail =
    process.env.MALV_SMOKE_USER_B_EMAIL || `launch-smoke-b+${Date.now()}@example.test`;
  const userBPassword = process.env.MALV_SMOKE_USER_B_PASSWORD || "ChangeMe_12345!";
  const config = {
    baseUrl,
    userAEmail,
    userAPassword,
    userANewPassword: process.env.MALV_SMOKE_USER_A_NEW_PASSWORD || "ChangeMe_67890!",
    userADisplayName: process.env.MALV_SMOKE_USER_A_DISPLAY_NAME || "Launch Smoke A",
    userBEmail,
    userBPassword,
    userBDisplayName: process.env.MALV_SMOKE_USER_B_DISPLAY_NAME || "Launch Smoke B",
    passwordResetToken: process.env.MALV_SMOKE_PASSWORD_RESET_TOKEN || "",
    callRecapPollAttempts: Math.max(3, Number(process.env.MALV_SMOKE_CALL_RECAP_POLL_ATTEMPTS || 12)),
    callRecapPollIntervalMs: Math.max(500, Number(process.env.MALV_SMOKE_CALL_RECAP_POLL_INTERVAL_MS || 2000)),
    includeStacks: parseBool(process.env.MALV_SMOKE_INCLUDE_STACKS, false)
  };
  const runner = new Runner(config);
  const summary = await runner.run();
  await fs.mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, `launch-smoke-${ts}.json`);
  const txtPath = path.join(outDir, `launch-smoke-${ts}.txt`);
  await fs.writeFile(jsonPath, JSON.stringify(summary, null, 2), "utf8");
  await fs.writeFile(txtPath, humanReport(summary), "utf8");
  console.log(humanReport(summary));
  console.log(`\nArtifacts written:`);
  console.log(`- ${jsonPath}`);
  console.log(`- ${txtPath}`);
  if (summary.overallStatus === "failed") process.exit(1);
}

main().catch((err) => {
  console.error(`launch-smoke-runner failed: ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
