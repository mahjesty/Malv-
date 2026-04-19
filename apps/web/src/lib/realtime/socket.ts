import { io, Socket } from "socket.io-client";
import { getApiBaseUrl } from "../api/http";
import { getStoredSession } from "../auth/session";

/** Socket.IO expects an http(s) URL; it picks ws/wss for the upgrade. */
function malvSocketUrl() {
  const base = getApiBaseUrl().replace(/\/+$/, "");
  return `${base}/malv`;
}

function malvBrowserExecutorDeviceId(): string {
  const key = "malv.browser.executor.deviceId.v1";
  try {
    const existing = window.localStorage.getItem(key);
    if (existing && existing.trim()) return existing.trim();
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `browser-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(key, id);
    return id;
  } catch {
    return "browser-default";
  }
}

type MalvDispatchPayload = {
  schemaVersion: 1;
  protocolVersion: 1;
  dispatchId: string;
  actionType: "show_notification" | "open_url" | "deep_link_task" | "deep_link_call" | "unsupported_kind";
  actionPayload: Record<string, unknown>;
  targetDeviceId: string | null;
  protocolMeta?: {
    identity?: { platform?: string };
  };
};

export function createMalvSocket() {
  const session = getStoredSession();
  const token = session?.accessToken;
  const url = malvSocketUrl();
  const browserDeviceId = malvBrowserExecutorDeviceId();
  const socket = io(url, {
    path: "/socket.io",
    auth: token
      ? {
          token,
          malvExecutorChannel: "browser",
          malvExecutorDeviceId: browserDeviceId
        }
      : {},
    transports: ["polling", "websocket"],
    autoConnect: true
  });

  const ack = async (
    dispatchId: string,
    body: {
      status: "accepted" | "completed" | "failed" | "rejected";
      reason?: string;
      detail?: string;
      result?: Record<string, unknown>;
    }
  ) => {
    if (!token) return;
    await fetch(`${getApiBaseUrl().replace(/\/+$/, "")}/v1/workspaces/malv/external-dispatch/${encodeURIComponent(dispatchId)}/ack`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.replace(/^Bearer\\s+/i, "")}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...body,
        executedAt: new Date().toISOString(),
        deviceId: browserDeviceId
      })
    });
  };

  const onExternalDispatch = async (payload: MalvDispatchPayload) => {
    if (!payload || payload.schemaVersion !== 1 || payload.protocolVersion !== 1 || typeof payload.dispatchId !== "string") return;
    if (payload.targetDeviceId && payload.targetDeviceId !== browserDeviceId) return;
    if (payload.actionType === "unsupported_kind") {
      await ack(payload.dispatchId, { status: "rejected", reason: "unsupported_action_type" });
      return;
    }
    await ack(payload.dispatchId, { status: "accepted" });
    try {
      if (payload.actionType === "show_notification") {
        const title = String(payload.actionPayload?.title ?? "MALV");
        const body = payload.actionPayload?.body != null ? String(payload.actionPayload.body) : "";
        if (typeof Notification !== "undefined") {
          if (Notification.permission === "granted") {
            new Notification(title, { body });
          } else if (Notification.permission === "default") {
            void Notification.requestPermission();
          }
        }
      } else if (payload.actionType === "open_url") {
        const urlRaw = payload.actionPayload?.url;
        if (typeof urlRaw !== "string" || !urlRaw.trim()) throw new Error("open_url_missing_url");
        const u = new URL(urlRaw);
        if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("open_url_unsafe_protocol");
        window.open(u.toString(), "_blank", "noopener,noreferrer");
      } else if (payload.actionType === "deep_link_task") {
        const taskId = payload.actionPayload?.taskId;
        if (typeof taskId !== "string" || !taskId.trim()) throw new Error("deep_link_task_missing_task_id");
        window.location.assign(`/app?taskId=${encodeURIComponent(taskId)}`);
      } else if (payload.actionType === "deep_link_call") {
        const callId = payload.actionPayload?.callSessionId ?? payload.actionPayload?.callId;
        if (typeof callId !== "string" || !callId.trim()) throw new Error("deep_link_call_missing_call_id");
        window.location.assign(`/app/video-call?callSessionId=${encodeURIComponent(callId)}`);
      }
      await ack(payload.dispatchId, {
        status: "completed",
        result: {
          bridge: "browser_agent",
          platform: payload.protocolMeta?.identity?.platform ?? "browser"
        }
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ack(payload.dispatchId, {
        status: "failed",
        reason: "execution_error",
        detail: msg.slice(0, 500)
      });
    }
  };
  socket.on("malv:external_action_dispatch", onExternalDispatch);

  if (import.meta.env.DEV) {
    socket.on("connect", () => {
      const transport = socket.io?.engine?.transport?.name;
      console.info("[malv:realtime] socket connect", { id: socket.id, transport });
    });
    socket.on("connect_error", (err: Error) => {
      console.warn("[malv:realtime] socket connect_error", {
        message: err.message,
        ...(err.cause != null ? { cause: err.cause } : {})
      });
    });
    socket.on("disconnect", (reason: string) => {
      console.info("[malv:realtime] socket disconnect", { id: socket.id, reason });
    });
  }

  return socket;
}

export type MalvSocket = Socket;
