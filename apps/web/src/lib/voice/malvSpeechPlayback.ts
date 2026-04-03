/** Self-hosted TTS playback singleton — one utterance at a time (assistant style, not call UI). */

export type MalvSpeechPlaybackStatus = "idle" | "playing" | "paused";

type Subscriber = () => void;

const subscribers = new Set<Subscriber>();

let audioEl: HTMLAudioElement | null = null;
let activeMessageId: string | null = null;
let lastText = "";
let lastMessageId: string | null = null;
let status: MalvSpeechPlaybackStatus = "idle";
let currentObjectUrl: string | null = null;

function notify() {
  for (const s of subscribers) s();
}

function revokeObjectUrl() {
  if (currentObjectUrl) {
    try {
      URL.revokeObjectURL(currentObjectUrl);
    } catch {
      /* noop */
    }
    currentObjectUrl = null;
  }
}

export function subscribeMalvSpeechPlayback(cb: Subscriber) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

export function getMalvSpeechPlaybackSnapshot() {
  return { status, activeMessageId, lastMessageId, lastText };
}

export function stripForSpeech(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/#{1,6}\s*/g, "")
    .replace(/\[(.*?)]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function stopMalvSpeech() {
  if (audioEl) {
    try {
      audioEl.pause();
    } catch {
      /* noop */
    }
    audioEl.src = "";
    audioEl = null;
  }
  revokeObjectUrl();
  activeMessageId = null;
  status = "idle";
  notify();
}

export function pauseMalvSpeech() {
  if (!audioEl) return;
  try {
    audioEl.pause();
  } catch {
    /* noop */
  }
  status = "paused";
  notify();
}

export function resumeMalvSpeech() {
  if (!audioEl) return;
  void audioEl.play().catch(() => {
    /* noop */
  });
  status = "playing";
  notify();
}

async function fetchTtsAudioBase64(text: string) {
  const { getStoredSession } = await import("../auth/session");
  const { apiFetch } = await import("../api/http");
  const session = getStoredSession();
  const res = await apiFetch<{ ok: boolean; mimeType?: string; audioB64?: string; error?: string }>({
    path: "/v1/voice/tts",
    method: "POST",
    accessToken: session?.accessToken ?? "",
    body: { text }
  });
  if (!res.ok || !res.audioB64) {
    throw new Error(res.error || "TTS failed");
  }
  return { mimeType: res.mimeType ?? "audio/wav", audioB64: res.audioB64 };
}

async function speakInternal(messageId: string, text: string) {
  if (typeof window === "undefined" || !text.trim()) return;

  stopMalvSpeech();

  lastText = text;
  lastMessageId = messageId;
  activeMessageId = messageId;

  try {
    const { mimeType, audioB64 } = await fetchTtsAudioBase64(text);
    const bytes = Uint8Array.from(atob(audioB64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: mimeType });
    const url = URL.createObjectURL(blob);
    currentObjectUrl = url;

    audioEl = new Audio(url);
    audioEl.onended = () => {
      if (activeMessageId === messageId) {
        stopMalvSpeech();
      }
    };
    audioEl.onerror = () => {
      if (activeMessageId === messageId) {
        stopMalvSpeech();
      }
    };

    status = "playing";
    notify();
    await audioEl.play();
  } catch {
    stopMalvSpeech();
  }
}

export function playMalvSpeech(messageId: string, text: string) {
  const plain = stripForSpeech(text);
  if (!plain) return;
  void speakInternal(messageId, plain);
}

export function replayMalvSpeech() {
  if (!lastMessageId || !lastText) return;
  playMalvSpeech(lastMessageId, lastText);
}

export function isMessageSpeaking(messageId: string) {
  return activeMessageId === messageId && status === "playing";
}

export function isMessagePaused(messageId: string) {
  return activeMessageId === messageId && status === "paused";
}
