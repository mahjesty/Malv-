/**
 * MALV execution agent core (ESM). Used by desktop + mobile-sim agents.
 * Does not fabricate OS-level effects beyond provided hooks.
 */
import { io } from "socket.io-client";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

function readDeviceId(storePath) {
  try {
    if (process.env.MALV_AGENT_DEVICE_ID?.trim()) {
      return process.env.MALV_AGENT_DEVICE_ID.trim().slice(0, 128);
    }
    if (fs.existsSync(storePath)) {
      const s = fs.readFileSync(storePath, "utf8").trim();
      if (s) return s.slice(0, 128);
    }
    const id = randomUUID();
    fs.writeFileSync(storePath, id, "utf8");
    return id;
  } catch {
    return randomUUID();
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const BASE_SAFE_ACTIONS = new Set(["show_notification", "open_url", "deep_link_task", "deep_link_call"]);

export async function startMalvExecutionAgent(opts) {
  const {
    agentType,
    /** 'desktop' | 'mobile' — maps to handshake channel */
    executorChannel,
    platform = agentType === "desktop" ? "desktop" : "android",
    allowLocalReminder = false,
    apiOrigin,
    jwt,
    heartbeatSeconds = 25,
    actionTimeoutMs = 45_000,
    /** async (url: string) => { ok: boolean; detail?: string } */
    openUrlInBrowser
  } = opts;

  if (!apiOrigin?.trim()) throw new Error("MALV_API_ORIGIN is required");
  if (!jwt?.trim()) throw new Error("MALV_AGENT_JWT is required");

  const origin = apiOrigin.replace(/\/$/, "");
  const deviceId = readDeviceId(path.join(process.cwd(), ".malv-agent-device-id"));
  const bridgeExpected = agentType === "desktop" ? "desktop_agent" : "mobile_agent";
  const safeActions = new Set(BASE_SAFE_ACTIONS);
  if (allowLocalReminder) safeActions.add("create_local_reminder");

  const ack = async (dispatchId, body) => {
    const res = await fetch(`${origin}/v1/workspaces/malv/external-dispatch/${encodeURIComponent(dispatchId)}/ack`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt.replace(/^Bearer\s+/i, "")}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ ...body, deviceId })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
      throw new Error(`ack_http_${res.status}:${JSON.stringify(json)}`);
    }
  };

  const socket = io(`${origin}/malv`, {
    path: "/socket.io",
    transports: ["websocket"],
    auth: {
      token: jwt.replace(/^Bearer\s+/i, ""),
      malvExecutorChannel: executorChannel,
      malvExecutorDeviceId: deviceId,
      malvExecutorPlatform: platform
    }
  });

  const heartbeatLoop = () => {
    socket.emit("malv:executor_heartbeat", { channel: executorChannel, deviceId, platform }, () => {});
  };

  socket.on("connect", () => {
    // eslint-disable-next-line no-console
    console.log(`[malv-agent:${agentType}] ws connected deviceId=${deviceId}`);
    heartbeatLoop();
  });

  setInterval(heartbeatLoop, Math.max(10, heartbeatSeconds) * 1000);

  socket.on("connect_error", (err) => {
    // eslint-disable-next-line no-console
    console.error(`[malv-agent:${agentType}] connect_error`, err?.message ?? err);
  });

  const inFlight = new Set();

  socket.on("malv:external_action_dispatch", async (payload) => {
    try {
      if (!payload || typeof payload !== "object") return;
      if (payload.schemaVersion !== 1 || payload.protocolVersion !== 1) {
        // eslint-disable-next-line no-console
        console.warn(`[malv-agent:${agentType}] skip dispatch — unsupported schema`, payload);
        return;
      }
      if (payload.bridge !== bridgeExpected) {
        return;
      }
      if (payload.targetDeviceId && payload.targetDeviceId !== deviceId) {
        // eslint-disable-next-line no-console
        console.log(`[malv-agent:${agentType}] skip dispatch — different targetDeviceId`);
        return;
      }
      const dispatchId = payload.dispatchId;
      if (typeof dispatchId !== "string" || inFlight.has(dispatchId)) return;
      inFlight.add(dispatchId);

      const actionType = payload.actionType;
      if (actionType === "unsupported_kind" || !safeActions.has(actionType)) {
        // eslint-disable-next-line no-console
        console.warn(`[malv-agent:${agentType}] reject unsupported actionType=${actionType}`);
        try {
          await ack(dispatchId, {
            status: "rejected",
            reason: "unsupported_action_type",
            detail: String(actionType ?? ""),
            executedAt: new Date().toISOString()
          });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(`[malv-agent:${agentType}] reject ack failed`, e?.message ?? e);
        } finally {
          inFlight.delete(dispatchId);
        }
        return;
      }

      try {
        await ack(dispatchId, {
          status: "accepted",
          executedAt: new Date().toISOString()
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(`[malv-agent:${agentType}] accepted ack failed`, e?.message ?? e);
        inFlight.delete(dispatchId);
        return;
      }

      try {
        await runWithTimeout(actionTimeoutMs, async () => {
          await executeSafeAction({ agentType, actionType, payload, openUrlInBrowser, platform });
        });
        const doneAt = new Date().toISOString();
        await ack(dispatchId, {
          status: "completed",
          executedAt: doneAt,
          result: { agentType, platform, mode: "log_or_browser", at: doneAt }
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // eslint-disable-next-line no-console
        console.error(`[malv-agent:${agentType}] action failed`, msg);
        const failAt = new Date().toISOString();
        try {
          await ack(dispatchId, {
            status: "failed",
            reason: "execution_error",
            detail: msg.slice(0, 2000),
            executedAt: failAt
          });
        } catch (e2) {
          // eslint-disable-next-line no-console
          console.error(`[malv-agent:${agentType}] failed ack failed`, e2?.message ?? e2);
        }
      } finally {
        inFlight.delete(dispatchId);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[malv-agent:${agentType}] dispatch handler error`, e?.message ?? e);
    }
  });

  // eslint-disable-next-line no-console
  console.log(`[malv-agent:${agentType}] bootstrap complete → ${origin} (${bridgeExpected})`);
}

function runWithTimeout(ms, fn) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("action_timeout")), ms);
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => clearTimeout(t));
  });
}

async function executeSafeAction({ agentType, actionType, payload, openUrlInBrowser, platform }) {
  const params = payload.actionPayload && typeof payload.actionPayload === "object" ? payload.actionPayload : {};

  switch (actionType) {
    case "show_notification": {
      const title = params.title != null ? String(params.title) : "(no title)";
      const body = params.body != null ? String(params.body) : "";
      // eslint-disable-next-line no-console
      console.log(`[malv-agent:${agentType}][show_notification] title=${JSON.stringify(title)} body=${JSON.stringify(body)}`);
      // eslint-disable-next-line no-console
      console.log(
        `[malv-agent:${agentType}][show_notification] OS notification not implemented — this is an honest console surface only.`
      );
      return;
    }
    case "open_url": {
      const raw = params.url;
      if (typeof raw !== "string" || !raw.trim()) throw new Error("open_url_missing_url");
      let u;
      try {
        u = new URL(raw.trim());
      } catch {
        throw new Error("open_url_invalid_url");
      }
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("open_url_unsafe_protocol");
      const r = await openUrlInBrowser(u.toString());
      if (!r?.ok) throw new Error(r?.detail ?? "open_url_failed");
      return;
    }
    case "deep_link_task": {
      // eslint-disable-next-line no-console
      console.log(`[malv-agent:${agentType}][deep_link_task] SIMULATED navigation`, JSON.stringify(params));
      return;
    }
    case "deep_link_call": {
      // eslint-disable-next-line no-console
      console.log(`[malv-agent:${agentType}][deep_link_call] SIMULATED navigation`, JSON.stringify(params));
      return;
    }
    case "create_local_reminder": {
      // eslint-disable-next-line no-console
      console.log(`[malv-agent:${agentType}][create_local_reminder] UNSUPPORTED platform=${platform}`);
      throw new Error("create_local_reminder_not_implemented");
    }
    default:
      throw new Error("unknown_action_after_filter");
  }
}
