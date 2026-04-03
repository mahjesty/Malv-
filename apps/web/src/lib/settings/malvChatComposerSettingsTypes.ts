import type { MicInteractionMode, VoiceRoute, VoiceSubmitMode } from "../voice/voiceAssistantTypes";

export type { VoiceSubmitMode };

/** How assistant replies are surfaced: text only, spoken only, or both with per-message controls. */
export type MalvReplyMode = "text" | "voice" | "text_and_voice";

export type MalvChatComposerSettings = {
  /** Tap = toggle record; hold = push-to-talk */
  voiceInputMode: MicInteractionMode;
  voiceSubmitMode: VoiceSubmitMode;
  /** Chat vs operator-style routing for typed and composer voice (STT → composer) paths */
  assistantRoute: VoiceRoute;
  replyMode: MalvReplyMode;
};

export const MALV_COMPOSER_SETTINGS_STORAGE_KEY = "malv_composer_settings_v1";
const LEGACY_SPEAK_REPLIES_KEY = "malv_speak_replies";

export const defaultMalvChatComposerSettings = (): MalvChatComposerSettings => ({
  voiceInputMode: "toggle",
  voiceSubmitMode: "manual",
  assistantRoute: "chat",
  replyMode: "text"
});

function parseStored(json: string | null): MalvChatComposerSettings | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json) as Partial<MalvChatComposerSettings>;
    const voiceInputMode = raw.voiceInputMode === "press" ? "press" : "toggle";
    const voiceSubmitMode = raw.voiceSubmitMode === "auto" ? "auto" : "manual";
    const assistantRoute = raw.assistantRoute === "operator" ? "operator" : "chat";
    let replyMode: MalvReplyMode = "text";
    if (raw.replyMode === "voice" || raw.replyMode === "text_and_voice") {
      replyMode = raw.replyMode;
    } else if (raw.replyMode === "text") {
      replyMode = "text";
    }
    return { voiceInputMode, voiceSubmitMode, assistantRoute, replyMode };
  } catch {
    return null;
  }
}

export function loadMalvChatComposerSettings(): MalvChatComposerSettings {
  if (typeof window === "undefined") return defaultMalvChatComposerSettings();

  const parsed = parseStored(window.localStorage.getItem(MALV_COMPOSER_SETTINGS_STORAGE_KEY));
  if (parsed) return parsed;

  const legacy = window.localStorage.getItem(LEGACY_SPEAK_REPLIES_KEY);
  const base = defaultMalvChatComposerSettings();
  if (legacy === "1") {
    return { ...base, replyMode: "text_and_voice" };
  }
  return base;
}

export function persistMalvChatComposerSettings(next: MalvChatComposerSettings) {
  try {
    window.localStorage.setItem(MALV_COMPOSER_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}
