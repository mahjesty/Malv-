import { io, Socket } from "socket.io-client";
import { getApiBaseUrl } from "../api/http";
import { getStoredSession } from "../auth/session";

/** Socket.IO expects an http(s) URL; it picks ws/wss for the upgrade. */
function malvSocketUrl() {
  const base = getApiBaseUrl().replace(/\/+$/, "");
  return `${base}/malv`;
}

export function createMalvSocket() {
  const session = getStoredSession();
  const token = session?.accessToken;
  const url = malvSocketUrl();
  const socket = io(url, {
    path: "/socket.io",
    auth: token ? { token } : {},
    transports: ["polling", "websocket"],
    autoConnect: true
  });

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
