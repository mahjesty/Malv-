#!/usr/bin/env node
/**
 * Real end-to-end MALV chat latency audit (no mocks).
 * - Auth: POST /v1/auth/login (or signup if login fails and CHAT_AUDIT_SIGNUP_PASSWORD is set)
 * - Primary path: Socket.IO namespace /malv, event chat:send (same contract as web)
 * - Companion: POST /v1/chat for sanitized routing meta (second LLM turn; disable with CHAT_AUDIT_HTTP_META=0)
 *
 * Env:
 *   CHAT_AUDIT_API_BASE   default http://127.0.0.1:8080
 *   CHAT_AUDIT_EMAIL      default test@malv.dev
 *   CHAT_AUDIT_PASSWORD   default test123
 *   CHAT_AUDIT_SIGNUP_PASSWORD — if login fails, signup with this password (min 10 chars per API)
 *   CHAT_AUDIT_HTTP_META  default 1 — set 0 to skip extra HTTP chat (no meta from API)
 *   CHAT_AUDIT_MESSAGE    default hello (exact UI test string)
 *   CHAT_AUDIT_SECOND_MESSAGE — optional second user text (WS+HTTP) to force inference routing after a greeting short-circuit
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";

const require = createRequire(import.meta.url);
const { io } = require("socket.io-client");

const AGENT_UNAVAILABLE =
  "This agent is temporarily unavailable. Please try again in a moment.";

const API_BASE = (process.env.CHAT_AUDIT_API_BASE ?? "http://127.0.0.1:8080").replace(/\/+$/, "");
const EMAIL = process.env.CHAT_AUDIT_EMAIL ?? "test@malv.dev";
const PASSWORD = process.env.CHAT_AUDIT_PASSWORD ?? "test123";
const SIGNUP_PASSWORD = process.env.CHAT_AUDIT_SIGNUP_PASSWORD ?? "test1234567890";
const DO_HTTP_META = !["0", "false", "no"].includes(String(process.env.CHAT_AUDIT_HTTP_META ?? "1").toLowerCase());
const CHAT_MESSAGE = (process.env.CHAT_AUDIT_MESSAGE ?? "hello").trim() || "hello";
const SECOND_MESSAGE = (process.env.CHAT_AUDIT_SECOND_MESSAGE ?? "").trim();

function nowMs() {
  return Date.now();
}

function mapTransportToRoute(transport, meta) {
  const m = meta && typeof meta === "object" ? meta : {};
  if (m.malvGreetingShortCircuit === true || m.malvReplySource === "malv_greeting_short_circuit") {
    return "greeting_short_circuit_no_llm";
  }
  const t = String(transport ?? "");
  if (t === "pending" || t === "") {
    return "inference_not_invoked_or_pending";
  }
  if (t.startsWith("local_") || t === "local_openai_compatible") return "local_inference_direct";
  if (t.includes("beast_worker")) return "beast_worker";
  if (t.includes("fallback") || t === "api_operator_fallback_brain") return "agent_fallback";
  return t;
}

async function fetchJson(path, { method = "GET", body, token, skipAuth = false } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined
  });
  const text = await res.text().catch(() => "");
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { res, json, text };
}

async function obtainSession() {
  const logs = [];
  for (const pwd of [PASSWORD, SIGNUP_PASSWORD]) {
    if (!pwd) continue;
    const login = await fetchJson("/v1/auth/login", {
      method: "POST",
      body: { email: EMAIL, password: pwd },
      skipAuth: true
    });
    logs.push({
      stage: "auth_login",
      at: nowMs(),
      status: login.res.status,
      ok: login.res.ok,
      password_variant: pwd === PASSWORD ? "primary" : "signup_fallback"
    });
    if (login.res.ok && login.json?.accessToken) {
      return { token: login.json.accessToken, logs, via: "login" };
    }
  }
  if (SIGNUP_PASSWORD.length >= 10) {
    const signup = await fetchJson("/v1/auth/signup", {
      method: "POST",
      body: { email: EMAIL, password: SIGNUP_PASSWORD, displayName: "MALV Chat Audit" },
      skipAuth: true
    });
    logs.push({
      stage: "auth_signup",
      at: nowMs(),
      status: signup.res.status,
      ok: signup.res.ok,
      note: signup.res.ok ? "created test user" : signup.text?.slice(0, 200)
    });
    if (signup.res.ok && signup.json?.accessToken) {
      return { token: signup.json.accessToken, logs, via: "signup" };
    }
  }
  const err = new Error(
    `Auth failed: signup attempted=${SIGNUP_PASSWORD.length >= 10} log_tail=${JSON.stringify(logs.slice(-2))}`
  );
  err.logs = logs;
  throw err;
}

function runWebSocketTurn(token, messageText) {
  const rawLogs = [];
  const socketUrl = `${API_BASE}/malv`;
  const stages = {
    request_received_at: null,
    routing_decision_at: null,
    inference_request_sent_at: null,
    first_token_received_at: null,
    stream_completed_at: null,
    assistant_finalized_at: null,
    response_sent_to_client_at: null
  };

  const errors = [];
  const warnings = [];
  let replyWillStream = null;
  let ackOk = null;
  let sawNonEmptyChunk = false;
  let lastChunkAt = null;
  let chunkCount = 0;
  let finalContent = "";
  let malvTurnOutcome = null;
  let terminal = null;

  return new Promise((resolve, reject) => {
    const socket = io(socketUrl, {
      path: "/socket.io",
      auth: { token },
      transports: ["polling", "websocket"],
      reconnection: false,
      timeout: 20_000
    });

    const assistantMessageId = randomUUID();
    const conversationId = null;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (lastChunkAt) stages.stream_completed_at = lastChunkAt;
      else if (stages.assistant_finalized_at != null) stages.stream_completed_at = stages.assistant_finalized_at;
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      resolve({
        stages,
        rawLogs,
        errors,
        warnings,
        assistantMessageId,
        ackOk,
        replyWillStream,
        sawNonEmptyChunk,
        chunkCount,
        lastChunkAt,
        finalContent,
        malvTurnOutcome,
        terminal,
        streaming_style: inferStreamingStyle(sawNonEmptyChunk, replyWillStream)
      });
    };

    const fail = (msg, extra) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      errors.push({ message: msg, ...extra });
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      reject(Object.assign(new Error(msg), { errors, rawLogs }));
    };

    const deadline = setTimeout(() => {
      if (settled) return;
      if (stages.assistant_finalized_at == null) {
        warnings.push({
          kind: "stream_incomplete",
          message: "assistant_done not received within 120s",
          at: nowMs()
        });
      }
      finish();
    }, 120_000);

    socket.on("connect_error", (e) => {
      rawLogs.push({ event: "connect_error", at: nowMs(), message: e?.message ?? String(e) });
      fail("socket_connect_error", { detail: e?.message ?? String(e) });
    });

    socket.on("chat:error", (p) => {
      const at = nowMs();
      rawLogs.push({ event: "chat:error", at, payload: p });
      const msg = p?.message ?? "";
      if (msg === AGENT_UNAVAILABLE || p?.code === "failed_before_output") {
        errors.push({
          kind: "agent_unavailable",
          code: p?.code,
          message: msg,
          at
        });
      } else {
        errors.push({ kind: "chat_error", code: p?.code, message: msg, at });
      }
      finish();
    });

    socket.on("malv:orchestration", (raw) => {
      const at = nowMs();
      rawLogs.push({ event: "malv:orchestration", at, type: raw?.type, raw: summarizeOrchestration(raw) });
      if (raw?.type === "thinking" && stages.routing_decision_at == null) {
        stages.routing_decision_at = at;
      }
      if (raw?.type === "assistant_done") {
        stages.assistant_finalized_at = at;
        stages.response_sent_to_client_at = at;
        finalContent = typeof raw.finalContent === "string" ? raw.finalContent : "";
        malvTurnOutcome = raw.malvTurnOutcome ?? null;
        terminal = raw.terminal ?? null;
        finish();
      }
    });

    socket.on("chat:reply_chunk", (p) => {
      const at = nowMs();
      chunkCount += 1;
      const text = typeof p?.text === "string" ? p.text : "";
      rawLogs.push({
        event: "chat:reply_chunk",
        at,
        index: p?.index,
        textLen: text.length,
        conversationId: p?.conversationId
      });
      if (text.length > 0) {
        if (!sawNonEmptyChunk) {
          sawNonEmptyChunk = true;
          stages.first_token_received_at = at;
        }
        lastChunkAt = at;
      }
    });

    socket.on("disconnect", (reason) => {
      rawLogs.push({ event: "socket_disconnect", at: nowMs(), reason });
    });

    socket.once("connect", () => {
      rawLogs.push({ event: "socket_connect", at: nowMs(), socketId: socket.id });
      stages.request_received_at = nowMs();
      stages.inference_request_sent_at = stages.request_received_at;

      socket.emit(
        "chat:send",
        {
          conversationId,
          message: messageText,
          beastLevel: "Smart",
          workspaceId: null,
          vaultSessionId: null,
          assistantMessageId,
          inputMode: "text",
          operatorPhase: null,
          userMoodHint: null,
          exploreHandoffJson: null
        },
        (ack) => {
          const at = nowMs();
          ackOk = Boolean(ack?.ok);
          replyWillStream = ack?.replyWillStream ?? null;
          rawLogs.push({ event: "chat:send_ack", at, ack });
          if (!ack?.ok) {
            errors.push({
              kind: "chat_send_rejected",
              error: ack?.error ?? "unknown",
              at
            });
            finish();
            return;
          }
          if (stages.routing_decision_at == null) {
            stages.routing_decision_at = at;
          }
        }
      );
    });
  });
}

function summarizeOrchestration(raw) {
  if (!raw || typeof raw !== "object") return raw;
  return {
    type: raw.type,
    phase: raw.phase,
    terminal: raw.terminal,
    malvTurnOutcome: raw.malvTurnOutcome,
    finalLen: typeof raw.finalContent === "string" ? raw.finalContent.length : undefined
  };
}

function inferStreamingStyle(sawNonEmptyChunk, replyWillStream) {
  if (replyWillStream) {
    return sawNonEmptyChunk ? "server_live_token_chunks" : "server_synthetic_chunks_replay";
  }
  return "non_streaming_ack";
}

async function httpChatMeta(token, messageText) {
  const assistantMessageId = randomUUID();
  const t0 = nowMs();
  const { res, json } = await fetchJson("/v1/chat", {
    method: "POST",
    token,
    body: {
      message: messageText,
      conversationId: null,
      assistantMessageId,
      beastLevel: "Smart",
      inputMode: "text"
    }
  });
  const t1 = nowMs();
  const trace = json?.meta?.malvInferenceTrace ?? null;
  const transport = trace?.malvChatInferenceTransport ?? null;
  const metaRoot = json?.meta ?? null;
  const replyText =
    typeof json?.reply === "string" && json.reply.length > 0
      ? json.reply
      : typeof json?.message === "string"
        ? json.message
        : "";
  return {
    http_status: res.status,
    http_ok: res.ok,
    is404: res.status === 404,
    at: t0,
    response_received_at: t1,
    meta: json?.meta ?? null,
    transport,
    route_used: mapTransportToRoute(transport, metaRoot),
    replyLen: replyText.length,
    reply_preview: replyText.slice(0, 120),
    agent_unavailable: replyText === AGENT_UNAVAILABLE,
    http_error_body: !res.ok ? String(json?._raw ?? JSON.stringify(json)).slice(0, 500) : null
  };
}

function buildLatencyBreakdown(stages) {
  const r = stages.request_received_at;
  const route = stages.routing_decision_at;
  const first = stages.first_token_received_at;
  const streamEnd = stages.stream_completed_at;
  const done = stages.assistant_finalized_at;

  return {
    routing_ms: r != null && route != null ? route - r : null,
    inference_start_delay_ms: r != null && first != null ? first - r : null,
    time_to_first_token_ms: r != null && first != null ? first - r : null,
    stream_duration_ms:
      first != null && streamEnd != null ? streamEnd - first : streamEnd != null && route != null ? streamEnd - route : null,
    finalization_delay_ms:
      streamEnd != null && done != null ? done - streamEnd : route != null && done != null && streamEnd == null ? done - route : null
  };
}

async function main() {
  const report = {
    api_base: API_BASE,
    route_used: null,
    transport_raw: null,
    latency_breakdown: {},
    errors: [],
    warnings: [],
    raw_logs: [],
    turns: [],
    ws: null,
    http_companion: null,
    streaming_vs_http: {
      primary_ui_path: "socket_io_chat_send_ack_then_chat_reply_chunk_and_malv_orchestration",
      http_fallback_path: "POST_/v1/chat_non_streaming_response_body"
    },
    notes: [
      "Timestamps are measured on the audit client (browser-equivalent). Stage names map to: request_received_at=WS connected+emit start; routing_decision_at=chat:send ack or first thinking; inference_request_sent_at=same as request_received_at here; first_token_received_at=first non-empty chat:reply_chunk; stream_completed_at=last chunk; assistant_finalized_at=malv:orchestration assistant_done; response_sent_to_client_at=assistant_done.",
      "Sanitized HTTP meta strips malvLocalInferenceProbeBaseUrl; configured ports are on the API host (MALV_LOCAL_INFERENCE_BASE_URL :8081, BEAST_WORKER_BASE_URL :9090)."
    ]
  };

  try {
    const { token, logs: authLogs, via } = await obtainSession();
    report.raw_logs.push(...authLogs.map((l) => ({ scope: "auth", ...l })));
    report.auth_via = via;

    const messages = [CHAT_MESSAGE, ...[SECOND_MESSAGE].filter(Boolean)];
    let lastHttp = null;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const turnLabel = i === 0 ? "primary" : "routing_probe";
      const scopePrefix = `turn${i}_${turnLabel}`;

      const ws = await runWebSocketTurn(token, msg);
      const turn = {
        label: turnLabel,
        user_message: msg,
        stage_timestamps: { ...ws.stages },
        latency_breakdown: buildLatencyBreakdown(ws.stages),
        ws: {
          ack_ok: ws.ackOk,
          reply_will_stream: ws.replyWillStream,
          streaming_style: ws.streaming_style,
          chunk_count: ws.chunkCount,
          saw_non_empty_chunk: ws.sawNonEmptyChunk,
          malv_turn_outcome: ws.malvTurnOutcome,
          terminal: ws.terminal,
          final_content_len: ws.finalContent?.length ?? 0,
          agent_unavailable_ws: ws.errors.some((e) => e.kind === "agent_unavailable")
        }
      };
      report.errors.push(...ws.errors.map((e) => ({ ...e, turn: turnLabel })));
      report.warnings.push(...ws.warnings.map((w) => ({ ...w, turn: turnLabel })));
      report.raw_logs.push(...ws.rawLogs.map((l) => ({ scope: `${scopePrefix}_ws`, ...l })));

      if (ws.finalContent?.includes(AGENT_UNAVAILABLE)) {
        report.errors.push({ kind: "agent_unavailable_text_in_final", source: "ws_final_content", turn: turnLabel });
      }

      if (DO_HTTP_META) {
        const httpR = await httpChatMeta(token, msg);
        lastHttp = httpR;
        turn.http = {
          http_status: httpR.http_status,
          http_ms: httpR.response_received_at - httpR.at,
          route_used: httpR.route_used,
          transport_raw: httpR.transport,
          streaming: false,
          replyLen: httpR.replyLen,
          malv_reply_source: httpR.meta?.malvReplySource ?? null
        };
        report.raw_logs.push({ scope: `${scopePrefix}_http`, event: "chat_post_complete", ...httpR });
        if (httpR.is404) {
          report.errors.push({ kind: "http_404", path: "/v1/chat", turn: turnLabel });
        } else if (!httpR.http_ok) {
          report.errors.push({
            kind: "http_chat_failed",
            status: httpR.http_status,
            detail: httpR.http_error_body,
            turn: turnLabel
          });
        }
        if (httpR.agent_unavailable) {
          report.errors.push({ kind: "agent_unavailable", source: "http_reply", turn: turnLabel });
        }
        if (String(httpR.transport ?? "").includes("fallback")) {
          report.warnings.push({ kind: "agent_fallback_meta", transport: httpR.transport, turn: turnLabel });
        }
      }

      report.turns.push(turn);
    }

    const primary = report.turns[0];
    if (primary) {
      report.latency_breakdown = primary.latency_breakdown;
      report.stage_timestamps = primary.stage_timestamps;
      report.ws = primary.ws;
    }

    if (DO_HTTP_META && lastHttp) {
      report.http_companion = lastHttp;
      const probeTurn = report.turns.find((t) => t.label === "routing_probe");
      const routeSource = probeTurn?.http ?? report.turns[0]?.http;
      report.route_used = routeSource?.route_used ?? mapTransportToRoute(lastHttp.transport, lastHttp.meta);
      report.transport_raw = routeSource?.transport_raw ?? lastHttp.transport;
      report.inference_streaming_used_ws = primary?.ws?.streaming_style ?? null;
    } else {
      report.warnings.push({
        kind: "http_meta_skipped",
        message: "Set CHAT_AUDIT_HTTP_META=1 for malvInferenceTransport from POST /v1/chat"
      });
      report.route_used = "unknown_http_meta_disabled";
    }

    console.log(JSON.stringify(report, null, 2));
  } catch (e) {
    report.errors.push({
      kind: "fatal",
      message: e instanceof Error ? e.message : String(e)
    });
    if (e.logs) report.raw_logs.push(...e.logs);
    if (Array.isArray(e.errors)) report.errors.push(...e.errors);
    if (Array.isArray(e.rawLogs)) report.raw_logs.push(...e.rawLogs.map((l) => ({ scope: "ws_fatal", ...l })));
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  }
}

main();
