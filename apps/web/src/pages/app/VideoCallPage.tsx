import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../lib/auth/AuthContext";
import { createCall, patchCallState } from "../../lib/api/dataPlane";
import { setMalvVaultSessionId } from "../../lib/malvOperatorPrefs";
import { createMalvSocket } from "../../lib/realtime/socket";
import { StatusChip } from "@malv/ui";
import { CallPresenceStage, type CallPhase } from "../../components/call/CallPresenceStage";
import { MobileSidebarTrigger } from "../../components/navigation/MobileSidebarTrigger";

const UUID_V4ISH = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function VideoCallPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const [searchParams] = useSearchParams();
  const videoConversationId = useMemo(() => {
    const raw = searchParams.get("conversationId") ?? searchParams.get("conversation");
    return raw && UUID_V4ISH.test(raw) ? raw : undefined;
  }, [searchParams]);
  /** Blueprint: group / collaboration sessions use a tighter presence policy (avatar switching restricted in UI). */
  const participationScope = useMemo(() => {
    const raw = (searchParams.get("scope") ?? "").toLowerCase();
    return raw === "group" ? ("group" as const) : ("direct" as const);
  }, [searchParams]);
  const socketRef = useRef<ReturnType<typeof createMalvSocket> | null>(null);
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [callSessionId, setCallSessionId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [runtime, setRuntime] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  async function onStart() {
    if (!token) return;
    setErr(null);
    setPhase("creating");
    try {
      const r = await createCall(token, "video", {
        conversationId: videoConversationId ?? undefined,
        participationScope: participationScope === "group" ? "group" : "direct"
      });
      setCallSessionId(r.callSessionId);
      setRuntime((r.runtime as Record<string, unknown> | null) ?? null);
      const sock = createMalvSocket();
      socketRef.current = sock;
      sock.on("connect", () => setSocketConnected(true));
      sock.on("disconnect", () => setSocketConnected(false));
      sock.on("call:runtime", (snap: Record<string, unknown>) => setRuntime(snap));
      sock.emit("call:join_room", { callSessionId: r.callSessionId });
      setPhase("active");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to start video session.");
      setPhase("idle");
    }
  }

  async function onEnd() {
    if (!token || !callSessionId) return;
    setErr(null);
    try {
      await patchCallState(token, callSessionId, "ended");
      setMalvVaultSessionId(null);
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
      setRuntime(null);
      setPhase("ended");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to end call.");
    }
  }

  const statusLabel =
    phase === "idle" ? "Standby" : phase === "creating" ? "Creating" : phase === "active" ? "Session active" : "Ended";

  const connectionLabel =
    phase === "active" ? (socketConnected ? "Socket connected" : "Socket reconnecting…") : "Socket idle";

  return (
    <div className="malv-operator-call-bg-video flex min-h-0 flex-1 flex-col">
      <header
        className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-3 sm:px-5"
        style={{ borderColor: "oklch(0.18 0.025 260)", background: "oklch(0.05 0.02 280 / 0.35)" }}
      >
        <div className="flex items-center gap-2">
          <MobileSidebarTrigger />
          <div>
            <h1 className="text-base font-semibold text-malv-text">Video link</h1>
            <p className="text-[11px] text-malv-text/50">Presence + session channel</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusChip label={statusLabel} status={phase === "active" ? "success" : "neutral"} />
          <span className="text-[10px] font-mono text-malv-text/45">{connectionLabel}</span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-6">
        <CallPresenceStage
          layout="stack"
          variant="video"
          phase={phase}
          socketConnected={socketConnected}
          callSessionId={callSessionId}
          statusLabel={statusLabel}
          connectionLabel={connectionLabel}
          error={err}
          onStart={() => void onStart()}
          onEnd={() => void onEnd()}
          startDisabled={!token}
          participationScope={participationScope}
          runtime={runtime}
          accessToken={token}
        />
      </div>
    </div>
  );
}
