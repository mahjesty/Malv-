import { io, type Socket } from "socket.io-client";

/**
 * MALV realtime + API base.
 * Uses cookie-backed auth; no browser token storage access.
 */

let socket: Socket | null = null;

export function getMalvApiBaseUrl(): string {
  return typeof process.env.NEXT_PUBLIC_MALV_API_URL === "string" && process.env.NEXT_PUBLIC_MALV_API_URL.length > 0
    ? process.env.NEXT_PUBLIC_MALV_API_URL
    : "http://localhost:8080";
}

export function getMalvSocketInstance(): Socket | null {
  return socket;
}

/** Idempotent: connects once per page load; relies on cookie-backed session auth. */
export function ensureMalvRuntimeConnection(): void {
  if (typeof window === "undefined") return;
  if (socket?.connected) return;

  const base = getMalvApiBaseUrl();
  socket = io(`${base}/malv`, {
    auth: {},
    withCredentials: true,
    transports: ["websocket", "polling"],
    autoConnect: true
  });

  if (process.env.NODE_ENV === "development") {
    socket.on("connect", () => void console.debug("[MALV] socket connected", base));
    socket.on("disconnect", (reason) => void console.debug("[MALV] socket disconnected", reason));
    socket.on("connect_error", (err) => void console.debug("[MALV] socket connect_error", err.message));
  }
}
