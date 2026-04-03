import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PropsWithChildren
} from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { getStoredSession } from "../auth/session";
import { ensureAccessTokenForApi } from "../auth/refreshSession";
import { createCall, fetchCallSession, patchCallControls, patchCallState } from "../api/dataPlane";
import { useMalvAppShellOptional } from "../context/MalvAppShellContext";
import { createMalvSocket, type MalvSocket } from "../realtime/socket";
import { setMalvVaultSessionId } from "../malvOperatorPrefs";
import { useVoiceAssistant } from "./useVoiceAssistant";
import type { VoiceAssistantPhase } from "./voiceAssistantTypes";
import type { VoiceCallResponsePayload } from "./voiceCallPayloadTypes";
import type { VoiceState } from "../../components/call/orb/LivingOrbVisualizer";
import { playMalvSpeech, stopMalvSpeech } from "./malvSpeechPlayback";
import type { VoiceTestTriggerResponse } from "../api/voiceTestTrigger";
import {
  markVoicePlaybackDiagReceived,
  playVoiceCallAssistantLocalAsset,
  playVoiceCallHttpTestResponse,
  resetVoiceCallPlaybackDebug,
  subscribeVoiceCallPlaybackDebug
} from "./voiceCallAssistantPlayback";

export type ConnectionState = "healthy" | "reconnecting";
export type CallPhase = "idle" | "precall" | "connecting" | "active" | "ending" | "ended";

type RuntimeSnap = {
  connectionState?: ConnectionState;
  voiceState?: "idle" | "listening" | "thinking" | "speaking" | "muted";
  micMuted?: boolean;
  malvPaused?: boolean;
  voiceFlowMode?: "onboarding" | "awaiting_transcript_consent" | "active" | "paused";
  callTranscriptEnabled?: boolean;
  status?: "active" | "ended";
  participationScope?: "direct" | "group";
};

function emitWithAck<T>(sock: MalvSocket, event: string, payload: Record<string, unknown>, timeoutMs: number): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`${event} ack timeout`)), timeoutMs);
    sock.emit(event, payload, (resp: T) => {
      window.clearTimeout(t);
      resolve(resp);
    });
  });
}

function mergeVoiceOrbState(
  rt: RuntimeSnap | null,
  socketConnected: boolean,
  micMuted: boolean,
  malvPaused: boolean,
  vaPhase: VoiceAssistantPhase
): VoiceState {
  if (micMuted) return "muted";
  if (!socketConnected) return "idle";
  if (malvPaused) return "idle";
  const bv = rt?.voiceState ?? "idle";
  const localListening =
    vaPhase === "arming" ||
    vaPhase === "listening" ||
    vaPhase === "speech_detected" ||
    vaPhase === "waiting_for_pause";
  const localThinking = vaPhase === "finalizing" || vaPhase === "transcribing";
  if (bv === "speaking") return "speaking";
  if (bv === "thinking") return "thinking";
  if (localThinking) return "thinking";
  if (bv === "listening") return "listening";
  if (localListening) return "listening";
  if (bv === "muted") return "muted";
  return "idle";
}

type DockSide = "left" | "right";
type CallStatus = "listening" | "thinking" | "speaking" | "muted" | "idle";

const UUID_V4ISH = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EndedCallBrief = {
  callSessionId: string;
  conversationId: string | null;
  recap: { summary?: string; actionItems?: string[]; decidedAt?: number } | null;
};

type VoiceCallShellContextValue = {
  callPhase: CallPhase;
  err: string | null;
  elapsed: number;
  controlsVisible: boolean;
  speakerOn: boolean;
  runtime: RuntimeSnap | null;
  socketConnected: boolean;
  micMuted: boolean;
  malvPaused: boolean;
  conn: ConnectionState;
  livingState: VoiceState;
  voice: ReturnType<typeof useVoiceAssistant>;
  orbOutputLevelRef: MutableRefObject<number>;
  orbContextRef: MutableRefObject<{ socketConnected: boolean; micMuted: boolean }>;
  assistantOutputAudioRef: MutableRefObject<HTMLAudioElement | null>;
  remoteAssistantRtcStreamRef: MutableRefObject<MediaStream | null>;

  callActive: boolean;
  callMinimized: boolean;
  callDockSide: DockSide;
  callDockY: number;
  callDockHidden: boolean;
  callDockDragging: boolean;
  callStatus: CallStatus;
  activeCallSessionId: string | null;
  /** Populated after a call ends when GET /v1/calls/:id returns recap / conversation link. */
  endedCallBrief: EndedCallBrief | null;
  returnTarget: string | null;
  unreadTranscriptCount: number;
  liveActivityPulse: boolean;

  setCallDockSide: (side: DockSide) => void;
  setCallDockY: (y: number) => void;
  setCallDockHidden: (hidden: boolean) => void;
  setCallDockDragging: (dragging: boolean) => void;
  setCallMinimized: (next: boolean, target?: string | null) => void;
  minimizeToReturnTarget: () => void;
  clearUnreadTranscript: () => void;
  setControlsVisible: (next: boolean) => void;
  handleControlInteract: () => void;
  handleScreenTap: () => void;
  handleStartCall: () => Promise<void>;
  handleEndCall: () => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleMalvPause: () => Promise<void>;
  toggleSpeaker: () => void;
  openFullCall: () => void;
  navigateBackToChat: () => void;
};

const VoiceCallShellContext = createContext<VoiceCallShellContextValue | null>(null);

export function VoiceCallShellProvider({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const malvShell = useMalvAppShellOptional();
  const { status, accessToken } = useAuth();
  const apiAccessToken = () => getStoredSession()?.accessToken ?? accessToken ?? undefined;

  const resolvedConversationIdForCall = useMemo(() => {
    const raw = searchParams.get("conversationId") ?? searchParams.get("conversation");
    if (raw && UUID_V4ISH.test(raw)) return raw;
    const shellId = malvShell?.activeChatConversationId ?? null;
    if (shellId && UUID_V4ISH.test(shellId)) return shellId;
    return undefined;
  }, [searchParams, malvShell?.activeChatConversationId]);

  const resolvedParticipationScope = useMemo(() => {
    const raw = (searchParams.get("scope") ?? "").toLowerCase();
    return raw === "group" ? ("group" as const) : ("direct" as const);
  }, [searchParams]);

  const socketRef = useRef<MalvSocket | null>(null);
  const callSessionIdRef = useRef<string | null>(null);
  const minimizedRef = useRef(false);
  const lastPathRef = useRef(location.pathname);
  const previousNonVoiceRouteRef = useRef<string>("/app/chat");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoHideRef = useRef<number | null>(null);
  const endingCallRef = useRef(false);
  const pulseTimerRef = useRef<number | null>(null);

  const [callPhase, setCallPhase] = useState<CallPhase>("precall");
  const [err, setErr] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [runtime, setRuntime] = useState<RuntimeSnap | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);

  const [callMinimized, setCallMinimizedState] = useState(false);
  const [callDockSide, setCallDockSide] = useState<DockSide>("right");
  const [callDockY, setCallDockY] = useState(110);
  const [callDockHidden, setCallDockHidden] = useState(true);
  const [callDockDragging, setCallDockDragging] = useState(false);
  const [returnTarget, setReturnTarget] = useState<string | null>("/app/chat");
  const [endedCallBrief, setEndedCallBrief] = useState<EndedCallBrief | null>(null);
  const [unreadTranscriptCount, setUnreadTranscriptCount] = useState(0);
  const [liveActivityPulse, setLiveActivityPulse] = useState(false);

  const orbOutputLevelRef = useRef(0.06);
  const orbContextRef = useRef({ socketConnected: false, micMuted: false });
  const assistantOutputAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteAssistantRtcStreamRef = useRef<MediaStream | null>(null);

  const getSocket = useCallback(() => socketRef.current, []);
  const getCallSessionId = useCallback(() => callSessionIdRef.current, []);

  const onOperatorVoiceTestHttpResult = useCallback(
    (result: VoiceTestTriggerResponse) => {
      if (!speakerOn) return;
      if (result.matched && result.ok) {
        stopMalvSpeech();
        void playVoiceCallHttpTestResponse({
          audioUrl: result.audioUrl,
          audioBase64: result.audioBase64,
          audioMimeType: result.audioMimeType,
          captionText: result.replyText,
          boundAudioEl: assistantOutputAudioRef.current
        });
      }
    },
    [speakerOn]
  );

  const resolveVoiceTestAccessToken = useCallback(async () => {
    const t = await ensureAccessTokenForApi(accessToken);
    return t ?? undefined;
  }, [accessToken]);

  const onOperatorVoiceEvent = useCallback(
    (ev: { kind: "response" | "operator_started" | "error"; payload: unknown }) => {
      if (ev.kind !== "response") return;
      const p = ev.payload as VoiceCallResponsePayload;
      const text = typeof p?.response === "string" ? p.response.trim() : "";
      if (!text || !speakerOn) return;

      if (minimizedRef.current) {
        setUnreadTranscriptCount((x) => x + 1);
        setLiveActivityPulse(true);
        if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
        pulseTimerRef.current = window.setTimeout(() => setLiveActivityPulse(false), 1200);
      }

      if (p.source === "canned_voice_test") {
        stopMalvSpeech();
        return;
      }
      const inst = p.playbackInstruction;
      if (inst?.mode === "local_asset" && inst.assetKey) {
        stopMalvSpeech();
        void playVoiceCallAssistantLocalAsset({
          messageId: p.playbackMessageId ?? `voice-${Date.now()}`,
          instruction: inst,
          captionText: text,
          boundAudioEl: assistantOutputAudioRef.current
        });
        return;
      }
      playMalvSpeech(p.playbackMessageId ?? `voice-${Date.now()}`, text);
    },
    [speakerOn]
  );

  const voice = useVoiceAssistant({
    getSocket,
    getCallSessionId,
    getVoiceRoute: () => "operator",
    getMicInteraction: () => "continuous",
    getVoiceSubmitMode: () => "manual",
    onComposerTranscript: () => {},
    getComposerText: () => "",
    onOperatorVoiceEvent,
    operatorUtteranceTransport: "http_test_trigger",
    resolveVoiceTestAccessToken,
    onOperatorVoiceTestHttpResult
  });

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resetAutoHide = useCallback(() => {
    if (autoHideRef.current) window.clearTimeout(autoHideRef.current);
    autoHideRef.current = window.setTimeout(() => setControlsVisible(false), 5000);
  }, []);

  const handleControlInteract = useCallback(() => {
    setControlsVisible(true);
    resetAutoHide();
  }, [resetAutoHide]);

  const micMuted = Boolean(runtime?.micMuted);
  const malvPaused = Boolean(runtime?.malvPaused);
  const conn: ConnectionState =
    !socketConnected && callPhase === "active" ? "reconnecting" : (runtime?.connectionState ?? "healthy");
  const livingState = useMemo(
    () => mergeVoiceOrbState(runtime, socketConnected, micMuted, malvPaused, voice.phase),
    [runtime, socketConnected, micMuted, malvPaused, voice.phase]
  );
  const callStatus: CallStatus = livingState;
  const callActive = callPhase === "active";

  const setCallMinimized = useCallback((next: boolean, target?: string | null) => {
    minimizedRef.current = next;
    setCallMinimizedState(next);
    if (next) {
      const resolvedTarget = target ?? returnTarget ?? previousNonVoiceRouteRef.current ?? "/app/chat";
      setReturnTarget(resolvedTarget);
      setCallDockHidden(true);
      return;
    }
    setUnreadTranscriptCount(0);
    setCallDockHidden(false);
  }, [returnTarget]);

  const minimizeToReturnTarget = useCallback(() => {
    if (!callActive) return;
    const target = returnTarget ?? previousNonVoiceRouteRef.current ?? "/app/chat";
    setCallMinimized(true, target);
    if (location.pathname.startsWith("/app/voice")) navigate(target);
  }, [callActive, location.pathname, navigate, returnTarget, setCallMinimized]);

  const resetCallUiState = useCallback(() => {
    minimizedRef.current = false;
    setCallMinimizedState(false);
    setCallDockSide("right");
    setCallDockY(110);
    setCallDockHidden(true);
    setCallDockDragging(false);
    setReturnTarget(previousNonVoiceRouteRef.current ?? "/app/chat");
    setUnreadTranscriptCount(0);
    setLiveActivityPulse(false);
    setControlsVisible(true);
  }, []);

  const clearUnreadTranscript = useCallback(() => setUnreadTranscriptCount(0), []);
  const toggleSpeaker = useCallback(() => setSpeakerOn((s) => !s), []);
  const navigateBackToChat = useCallback(() => {
    const cid = endedCallBrief?.conversationId;
    if (cid) navigate(`/app/chat?conversationId=${encodeURIComponent(cid)}`);
    else navigate("/app/chat");
  }, [navigate, endedCallBrief?.conversationId]);

  const openFullCall = useCallback(() => {
    setCallMinimized(false);
    setControlsVisible(true);
    navigate("/app/voice");
  }, [navigate, setCallMinimized]);

  useEffect(() => {
    orbContextRef.current.socketConnected = socketConnected;
    orbContextRef.current.micMuted = micMuted;
  }, [socketConnected, micMuted]);

  useEffect(() => {
    return subscribeVoiceCallPlaybackDebug(() => {});
  }, []);

  useEffect(() => {
    return () => {
      stopTimer();
      if (autoHideRef.current) window.clearTimeout(autoHideRef.current);
      if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [stopTimer]);

  useEffect(() => {
    const wasVoice = lastPathRef.current.startsWith("/app/voice");
    const isVoice = location.pathname.startsWith("/app/voice");
    if (callPhase === "ended" && !isVoice) {
      setCallPhase("precall");
    }
    if (!isVoice) {
      previousNonVoiceRouteRef.current = location.pathname;
    } else if (!wasVoice) {
      setReturnTarget(lastPathRef.current || previousNonVoiceRouteRef.current || "/app/chat");
    }
    if (callActive && !isVoice) {
      setCallMinimized(true, location.pathname);
    }
    if (callActive && isVoice) {
      setCallMinimized(false);
    }
    lastPathRef.current = location.pathname;
  }, [callActive, callPhase, location.pathname, setCallMinimized]);

  useEffect(() => {
    if (callPhase !== "active" || !socketConnected) return;
    const sock = socketRef.current;
    if (!sock) return;
    const onVoicePlaybackDiag = () => markVoicePlaybackDiagReceived();
    sock.on("voice:playback", onVoicePlaybackDiag);
    return () => {
      sock.off("voice:playback", onVoicePlaybackDiag);
    };
  }, [callPhase, socketConnected]);

  useEffect(() => {
    if (callPhase !== "active") return;
    const sock = socketRef.current;
    if (!sock) return;
    const onUi = (p: { action?: string }) => {
      if (p?.action === "open_dashboard" || p?.action === "check_memory") navigate("/app/chat");
    };
    sock.on("voice:ui_action", onUi);
    return () => {
      sock.off("voice:ui_action", onUi);
    };
  }, [callPhase, navigate]);

  useEffect(() => {
    if (callPhase !== "active") return;
    if (!socketConnected || micMuted || malvPaused || voice.phase === "error") {
      voice.cancelRecording();
      return;
    }
    if (
      voice.phase === "finalizing" ||
      voice.phase === "transcribing" ||
      voice.phase === "committed" ||
      voice.phase === "arming"
    ) {
      return;
    }
    if (voice.phase === "idle") voice.startListening();
  }, [callPhase, socketConnected, micMuted, malvPaused, voice.phase, voice.cancelRecording, voice.startListening]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = callActive
      ? new MediaMetadata({
          title: "MALV Live Call",
          artist: "MALV",
          album: callStatus.charAt(0).toUpperCase() + callStatus.slice(1)
        })
      : null;
    try {
      navigator.mediaSession.setActionHandler("stop", callActive ? () => void handleEndCall() : null);
      navigator.mediaSession.setActionHandler("play", callActive ? () => setCallMinimized(false) : null);
      navigator.mediaSession.setActionHandler("pause", callActive ? minimizeToReturnTarget : null);
    } catch {
      /* unsupported action handlers */
    }
  }, [callActive, callStatus, minimizeToReturnTarget, setCallMinimized]);

  async function handleStartCall() {
    if (status === "loading") {
      setErr("Preparing your session…");
      return;
    }
    if (status === "unauthenticated") {
      setErr("Sign in to start a voice call.");
      return;
    }
    setEndedCallBrief(null);
    setErr(null);
    resetVoiceCallPlaybackDebug();
    setCallPhase("connecting");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    try {
      const token = await ensureAccessTokenForApi(accessToken);
      if (!token) {
        setErr("Sign in to start a voice call.");
        setCallPhase("precall");
        return;
      }
      const r = await createCall(token, "voice", {
        conversationId: resolvedConversationIdForCall ?? undefined,
        participationScope: resolvedParticipationScope === "group" ? "group" : "direct"
      });
      const id = r.callSessionId;
      callSessionIdRef.current = id;
      const sock = createMalvSocket();
      socketRef.current = sock;
      sock.on("connect", () => setSocketConnected(true));
      sock.on("disconnect", () => setSocketConnected(false));
      sock.on("call:runtime", (snap: RuntimeSnap) => setRuntime(snap));
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Socket connection timed out.")), 12000);
        if (sock.connected) {
          window.clearTimeout(t);
          resolve();
          return;
        }
        sock.once("connect", () => {
          window.clearTimeout(t);
          resolve();
        });
        sock.once("connect_error", (e: Error) => {
          window.clearTimeout(t);
          reject(e);
        });
      });

      try {
        const joinAck = await emitWithAck<{ ok?: boolean; runtime?: RuntimeSnap; error?: string }>(
          sock,
          "call:join_room",
          { callSessionId: id },
          12000
        );
        if (joinAck && typeof joinAck === "object" && joinAck.ok === false) throw new Error(joinAck.error ?? "Could not join call room.");
        if (joinAck?.runtime && typeof joinAck.runtime === "object") setRuntime(joinAck.runtime);
      } catch {
        sock.emit("call:join_room", { callSessionId: id });
      }

      setCallPhase("active");
      setCallMinimized(false);
      setControlsVisible(true);
      resetAutoHide();
      setElapsed(0);
      stopTimer();
      timerRef.current = setInterval(() => setElapsed((x) => x + 1), 1000);
    } catch (e) {
      callSessionIdRef.current = null;
      socketRef.current?.disconnect();
      socketRef.current = null;
      setErr(e instanceof Error ? e.message : "Could not start voice call.");
      setCallPhase("precall");
    }
  }

  async function handleEndCall() {
    if (endingCallRef.current) return;
    endingCallRef.current = true;
    try {
      voice.cancelRecording();
      setCallPhase("ending");
      const id = callSessionIdRef.current;
      const sock = socketRef.current;
      stopTimer();
      let endMessage: string | null = null;
      if (sock?.connected && id) {
        try {
          const ack = await emitWithAck<{ ok?: boolean; error?: string }>(sock, "call:end", { callSessionId: id }, 15000);
          if (ack && typeof ack === "object" && ack.ok === false && typeof ack.error === "string") endMessage = ack.error;
        } catch (e) {
          endMessage = e instanceof Error ? e.message : "Realtime end failed";
        }
      }
      const endToken = apiAccessToken();
      if (endToken && id) {
        try {
          await patchCallState(endToken, id, "ended");
          setMalvVaultSessionId(null);
          try {
            const detail = await fetchCallSession(endToken, id);
            if (detail.ok && detail.runtime && typeof detail.runtime === "object") {
              const rt = detail.runtime as Record<string, unknown>;
              const rawRecap = rt.recap;
              const recap =
                rawRecap && typeof rawRecap === "object"
                  ? {
                      summary: typeof (rawRecap as { summary?: unknown }).summary === "string" ? (rawRecap as { summary: string }).summary : undefined,
                      actionItems: Array.isArray((rawRecap as { actionItems?: unknown }).actionItems)
                        ? (rawRecap as { actionItems: unknown[] }).actionItems.filter((x): x is string => typeof x === "string")
                        : undefined,
                      decidedAt:
                        typeof (rawRecap as { decidedAt?: unknown }).decidedAt === "number"
                          ? (rawRecap as { decidedAt: number }).decidedAt
                          : undefined
                    }
                  : null;
              const hasRecap =
                Boolean(recap?.summary?.trim()) || Boolean(recap?.actionItems?.length) || typeof recap?.decidedAt === "number";
              setEndedCallBrief({
                callSessionId: id,
                conversationId: typeof rt.conversationId === "string" ? rt.conversationId : null,
                recap: hasRecap ? recap : null
              });
            } else {
              setEndedCallBrief({ callSessionId: id, conversationId: null, recap: null });
            }
          } catch {
            /* recap fetch is best-effort */
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Could not persist call end";
          if (!endMessage) endMessage = msg;
        }
      }
      sock?.disconnect();
      socketRef.current = null;
      callSessionIdRef.current = null;
      resetVoiceCallPlaybackDebug();
      try {
        assistantOutputAudioRef.current?.pause();
        if (assistantOutputAudioRef.current) assistantOutputAudioRef.current.src = "";
      } catch {
        /* noop */
      }
      setSocketConnected(false);
      setRuntime(null);
      orbOutputLevelRef.current = 0.06;
      resetCallUiState();
      if (endMessage) setErr(endMessage);
      setCallPhase("ended");
    } finally {
      endingCallRef.current = false;
    }
  }

  async function toggleMic() {
    const id = callSessionIdRef.current;
    const t = apiAccessToken();
    if (!t || !id || !runtime) return;
    const next = !runtime.micMuted;
    try {
      await patchCallControls(t, id, { micMuted: next });
    } catch {
      setErr("Could not update microphone.");
    }
  }

  async function toggleMalvPause() {
    const id = callSessionIdRef.current;
    const t = apiAccessToken();
    if (!t || !id || !runtime) return;
    const next = !runtime.malvPaused;
    try {
      await patchCallControls(t, id, { malvPaused: next });
    } catch {
      setErr("Could not pause MALV.");
    }
  }

  const handleScreenTap = useCallback(() => {
    if (!callActive || callMinimized) return;
    setControlsVisible((v) => {
      const next = !v;
      if (next) resetAutoHide();
      else if (autoHideRef.current) window.clearTimeout(autoHideRef.current);
      return next;
    });
  }, [callActive, callMinimized, resetAutoHide]);

  const value: VoiceCallShellContextValue = {
    callPhase,
    err,
    elapsed,
    controlsVisible,
    speakerOn,
    runtime,
    socketConnected,
    micMuted,
    malvPaused,
    conn,
    livingState,
    voice,
    orbOutputLevelRef,
    orbContextRef,
    assistantOutputAudioRef,
    remoteAssistantRtcStreamRef,
    callActive,
    callMinimized,
    callDockSide,
    callDockY,
    callDockHidden,
    callDockDragging,
    callStatus,
    activeCallSessionId: callSessionIdRef.current,
    endedCallBrief,
    returnTarget,
    unreadTranscriptCount,
    liveActivityPulse,
    setCallDockSide,
    setCallDockY,
    setCallDockHidden,
    setCallDockDragging,
    setCallMinimized,
    minimizeToReturnTarget,
    clearUnreadTranscript,
    setControlsVisible,
    handleControlInteract,
    handleScreenTap,
    handleStartCall,
    handleEndCall,
    toggleMic,
    toggleMalvPause,
    toggleSpeaker,
    openFullCall,
    navigateBackToChat
  };

  return <VoiceCallShellContext.Provider value={value}>{children}</VoiceCallShellContext.Provider>;
}

export function useVoiceCallShell() {
  const ctx = useContext(VoiceCallShellContext);
  if (!ctx) throw new Error("useVoiceCallShell must be used inside VoiceCallShellProvider");
  return ctx;
}
