/**
 * Voice-call assistant output: local assets, future TTS, future WebRTC.
 * Separate from chat `malvSpeechPlayback`.
 */

import type { VoicePlaybackInstructionPayload } from "./voiceCallPayloadTypes";

const LOG = "[malv-voice-debug]";
const IS_DEV = import.meta.env.DEV;

export const VOICE_CALL_LOCAL_ASSET_URLS: Record<string, string> = {
  malv_voice_test: "/test-audio/malv-voice-test.wav"
};

export type VoiceCallPlaybackDebug = {
  lastAssetUrl: string | null;
  lastAssetKey: string | null;
  playbackStarted: boolean;
  playbackSettled: boolean;
  lastError: string | null;
  lastPlayMessage: string | null;
  voicePlaybackDiagReceived: boolean;
  cannedTriggerFromResponse: boolean;
  testPlaybackEventReceived: boolean;
  /** HTTP voice-test path: `play()` was invoked. */
  playbackRequested: boolean;
  /** HTTP / asset path: `ended` fired on the audio element. */
  playbackEnded: boolean;
};

const debugListeners = new Set<(d: Partial<VoiceCallPlaybackDebug>) => void>();

export function subscribeVoiceCallPlaybackDebug(cb: (d: Partial<VoiceCallPlaybackDebug>) => void) {
  debugListeners.add(cb);
  return () => {
    debugListeners.delete(cb);
  };
}

function pushDebug(patch: Partial<VoiceCallPlaybackDebug>) {
  for (const cb of debugListeners) cb(patch);
}

async function playUrlOnAssistantElement(args: {
  absUrl: string;
  messageId: string;
  captionText: string;
  boundAudioEl: HTMLAudioElement | null;
  logLabel: string;
  revokeObjectUrl?: string | null;
}) {
  const { absUrl, messageId, captionText, boundAudioEl, logLabel, revokeObjectUrl } = args;
  if (IS_DEV) {
    console.info(`${LOG} ${logLabel} url`, { messageId, absUrl, captionLen: captionText.length });
  }
  pushDebug({
    lastAssetUrl: absUrl,
    lastError: null,
    playbackRequested: true
  });

  const el = boundAudioEl ?? new Audio();
  el.setAttribute("playsinline", "true");
  el.muted = false;
  el.volume = 1;
  el.preload = "auto";

  const prevSrc = el.src;
  el.src = absUrl;
  if (IS_DEV) {
    console.info(`${LOG} ${logLabel} audio_src_set`, { messageId, from: prevSrc || null, to: el.currentSrc || el.src });
  }

  const onEnded = () => {
    if (revokeObjectUrl) {
      try {
        URL.revokeObjectURL(revokeObjectUrl);
      } catch {
        /* noop */
      }
    }
    if (IS_DEV) {
      console.info(`${LOG} ${logLabel} audio_playback_ended`, { messageId });
    }
    pushDebug({ playbackSettled: true, playbackStarted: false, playbackEnded: true });
    el.removeEventListener("ended", onEnded);
    el.removeEventListener("error", onErr);
  };
  const onErr = () => {
    if (revokeObjectUrl) {
      try {
        URL.revokeObjectURL(revokeObjectUrl);
      } catch {
        /* noop */
      }
    }
    const code = el.error?.code;
    const msg = el.error?.message ?? "audio_element_error";
    console.error(`${LOG} ${logLabel} audio_element_error`, { messageId, code, msg });
    pushDebug({ lastError: `audio_error:${code ?? "?"}:${msg}`, playbackSettled: true, playbackStarted: false });
    el.removeEventListener("ended", onEnded);
    el.removeEventListener("error", onErr);
  };
  el.addEventListener("ended", onEnded);
  el.addEventListener("error", onErr);

  try {
    pushDebug({ playbackStarted: false });
    const p = el.play();
    if (IS_DEV) {
      console.info(`${LOG} ${logLabel} audio_play_invoked`, { messageId, hasPromise: Boolean(p) });
    }
    await p;
    if (IS_DEV) {
      console.info(`${LOG} ${logLabel} audio_play_promise_resolved`, { messageId });
    }
    pushDebug({ playbackStarted: true, lastError: null });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    const name = e instanceof Error ? e.name : "Error";
    console.error(`${LOG} ${logLabel} audio_play_promise_rejected`, { messageId, name, err });
    pushDebug({ lastError: `${name}:${err}`, playbackStarted: false, playbackSettled: true });
  }
}

function resolveLocalAssetUrl(assetKey: string): string | null {
  const url = VOICE_CALL_LOCAL_ASSET_URLS[assetKey];
  if (!url) {
    if (IS_DEV) {
      console.warn(`${LOG} unknown assetKey`, assetKey, Object.keys(VOICE_CALL_LOCAL_ASSET_URLS));
    }
    return null;
  }
  return url;
}

export async function playVoiceCallAssistantLocalAsset(args: {
  messageId: string;
  instruction: VoicePlaybackInstructionPayload;
  captionText: string;
  boundAudioEl: HTMLAudioElement | null;
}): Promise<void> {
  const { instruction, boundAudioEl, captionText, messageId } = args;
  if (instruction.mode !== "local_asset" || !instruction.assetKey) {
    if (IS_DEV) {
      console.warn(`${LOG} unsupported instruction`, instruction);
    }
    return;
  }

  const rel = resolveLocalAssetUrl(instruction.assetKey);
  if (!rel) {
    pushDebug({ lastError: `unknown_asset:${instruction.assetKey}`, lastPlayMessage: captionText });
    return;
  }

  const absUrl = new URL(rel, window.location.origin).href;
  if (IS_DEV) {
    console.info(`${LOG} asset_selected`, {
      messageId,
      assetKey: instruction.assetKey,
      url: absUrl,
      captionLen: captionText.length
    });
  }
  pushDebug({
    lastAssetKey: instruction.assetKey,
    cannedTriggerFromResponse: true,
    lastPlayMessage: captionText
  });

  await playUrlOnAssistantElement({
    absUrl,
    messageId,
    captionText,
    boundAudioEl,
    logLabel: "local_asset"
  });
}

/** Plays URL from `voice:test_playback` socket (isolated adapter entry for future TTS). */
export async function playVoiceCallTestPlaybackSocket(args: {
  assetUrl: string;
  captionText: string;
  boundAudioEl: HTMLAudioElement | null;
  callSessionId?: string | null;
}): Promise<void> {
  const messageId = `voice-test-playback-${args.callSessionId ?? "na"}-${Date.now()}`;
  const absUrl = args.assetUrl.startsWith("http")
    ? args.assetUrl
    : new URL(args.assetUrl, window.location.origin).href;
  if (IS_DEV) {
    console.info(`${LOG} voice:test_playback client received — starting play`, {
      callSessionId: args.callSessionId ?? null,
      absUrl
    });
  }
  pushDebug({
    testPlaybackEventReceived: true,
    lastPlayMessage: args.captionText,
    cannedTriggerFromResponse: true,
    lastAssetKey: "socket_voice_test_playback"
  });
  await playUrlOnAssistantElement({
    absUrl,
    messageId,
    captionText: args.captionText,
    boundAudioEl: args.boundAudioEl,
    logLabel: "voice:test_playback"
  });
}

export function markVoicePlaybackDiagReceived() {
  pushDebug({ voicePlaybackDiagReceived: true });
}

export function resetVoiceCallPlaybackDebug() {
  pushDebug({
    lastAssetUrl: null,
    lastAssetKey: null,
    playbackStarted: false,
    playbackSettled: false,
    lastError: null,
    lastPlayMessage: null,
    voicePlaybackDiagReceived: false,
    cannedTriggerFromResponse: false,
    testPlaybackEventReceived: false,
    playbackRequested: false,
    playbackEnded: false
  });
}

/** Play canned test reply from `POST /v1/voice/test-trigger` (URL and/or base64 WAV from local TTS). */
export async function playVoiceCallHttpTestResponse(args: {
  audioUrl: string | null;
  audioBase64: string | null;
  audioMimeType: string | null;
  captionText: string;
  boundAudioEl: HTMLAudioElement | null;
}): Promise<void> {
  const messageId = `voice-http-test-${Date.now()}`;
  let absUrl: string;
  let revokeObjectUrl: string | null = null;

  if (args.audioBase64 && args.audioMimeType) {
    try {
      const bin = atob(args.audioBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: args.audioMimeType });
      revokeObjectUrl = URL.createObjectURL(blob);
      absUrl = revokeObjectUrl;
    } catch (e) {
      console.error(`${LOG} http_test base64_decode_failed`, e);
      pushDebug({ lastError: "http_test_base64_decode_failed", lastPlayMessage: args.captionText });
      return;
    }
  } else if (args.audioUrl) {
    absUrl = args.audioUrl.startsWith("http")
      ? args.audioUrl
      : new URL(args.audioUrl, window.location.origin).href;
  } else {
    console.error(`${LOG} http_test no_audio_payload`);
    pushDebug({ lastError: "http_test_no_audio", lastPlayMessage: args.captionText });
    return;
  }

  pushDebug({
    cannedTriggerFromResponse: true,
    lastPlayMessage: args.captionText,
    lastAssetKey: "http_voice_test_trigger"
  });

  await playUrlOnAssistantElement({
    absUrl,
    messageId,
    captionText: args.captionText,
    boundAudioEl: args.boundAudioEl,
    logLabel: "http:test-trigger",
    revokeObjectUrl
  });
}
