import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../lib/auth/AuthContext";
import { createCall, patchCallState } from "../../lib/api/dataPlane";
import { setMalvVaultSessionId } from "../../lib/malvOperatorPrefs";
import { createMalvSocket } from "../../lib/realtime/socket";
import { CallPresenceStage, type CallPhase } from "../../components/call/CallPresenceStage";
import { MobileSidebarTrigger } from "../../components/navigation/MobileSidebarTrigger";

const UUID_V4ISH = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function PhaseIndicator({ phase }: { phase: CallPhase }) {
  if (phase === "active") {
    return (
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
    );
  }
  if (phase === "creating") {
    return (
      <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400/70 animate-pulse-soft" />
    );
  }
  return <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "rgb(var(--malv-muted-rgb) / 0.3)" }} />;
}

export function VideoCallPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const [searchParams] = useSearchParams();
  const videoConversationId = useMemo(() => {
    const raw = searchParams.get("conversationId") ?? searchParams.get("conversation");
    return raw && UUID_V4ISH.test(raw) ? raw : undefined;
  }, [searchParams]);
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
    phase === "idle" ? "Standby" :
    phase === "creating" ? "Connecting" :
    phase === "active" ? "Live" :
    "Ended";

  const connectionLabel =
    phase === "active" ? (socketConnected ? "Connected" : "Reconnecting…") : "";

  return (
    <div
      className="malv-operator-call-bg-video flex min-h-0 flex-1 flex-col"
      style={{ transition: "background-color 220ms ease" }}
    >
      <header
        className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 sm:px-5"
        style={{
          background: "rgb(var(--malv-canvas-rgb) / 0.85)",
          borderBottom: "1px solid rgb(var(--malv-border-rgb) / 0.08)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)"
        }}
      >
        <div className="flex items-center gap-3">
          <MobileSidebarTrigger />
          <div className="flex items-center gap-2">
            <PhaseIndicator phase={phase} />
            <div>
              <h1 className="text-[13px] font-semibold" style={{ color: "rgb(var(--malv-text-rgb))" }}>
                Video
              </h1>
              {connectionLabel ? (
                <p className="text-[10px] font-mono" style={{ color: "rgb(var(--malv-muted-rgb) / 0.65)" }}>
                  {connectionLabel}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div
          className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium"
          style={{
            background:
              phase === "active" ? "rgb(52 211 153 / 0.1)" :
              phase === "creating" ? "rgb(251 191 36 / 0.1)" :
              "rgb(var(--malv-surface-raised-rgb))",
            border: `1px solid ${
              phase === "active" ? "rgb(52 211 153 / 0.2)" :
              phase === "creating" ? "rgb(251 191 36 / 0.2)" :
              "rgb(var(--malv-border-rgb) / 0.08)"
            }`,
            color:
              phase === "active" ? "rgb(52 211 153 / 0.9)" :
              phase === "creating" ? "rgb(251 191 36 / 0.9)" :
              "rgb(var(--malv-muted-rgb))"
          }}
        >
          {statusLabel}
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
