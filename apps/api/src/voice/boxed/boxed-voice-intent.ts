import type { BoxedVoiceIntent, TranscriptConsentClass } from "./boxed-voice.types";

export function normalizeUtterance(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const AFFIRMATIVE_PHRASES = [
  "yes transcribe it",
  "yes transcribe",
  "turn transcription on",
  "turn on transcription",
  "enable transcript",
  "enable transcription",
  "transcription on",
  "transcript on",
  "start transcribing",
  "start transcription",
  "go ahead",
  "go ahead and transcribe",
  "yes you can transcribe",
  "please transcribe",
  "transcribe it",
  "transcribe this",
  "record this call",
  "record the call",
  "sure",
  "absolutely",
  "please do",
  "that would be great",
  "sounds good"
];

const NEGATIVE_PHRASES = [
  "no transcript",
  "no transcription",
  "don't transcribe",
  "do not transcribe",
  "dont transcribe",
  "leave transcription off",
  "leave it off",
  "keep transcription off",
  "keep it off",
  "transcription off",
  "transcript off",
  "not now",
  "no thanks",
  "rather not",
  "skip transcription",
  "without transcription",
  "no recording"
];

/** Heuristic: user is asking for something other than consent during the consent gate. */
export function looksLikeOffTopicDuringConsent(n: string): boolean {
  if (n.includes("dashboard") || n.includes("memory") || n.includes("summarize") || n.includes("summary")) return true;
  if (n.includes("stop") || n.includes("pause") || n.includes("quit") || n.includes("exit")) return true;
  if (n.includes("help") || n.includes("what can you")) return true;
  if (n.includes("open ") || n.includes("navigate")) return true;
  if (n.includes("hey") && n.length > 8) return true;
  return false;
}

/**
 * Classify spoken transcript consent. Checks negatives before bare "yes"/"no" to reduce false positives.
 */
export function classifyTranscriptConsent(raw: string): TranscriptConsentClass {
  const n = normalizeUtterance(raw);
  if (!n) return "unknown";

  for (const phrase of NEGATIVE_PHRASES) {
    if (n.includes(phrase)) return "transcript_consent_no";
  }

  if (/\bno\b/.test(n) && !/\bno\s+(doubt|problem|worries)\b/.test(n)) {
    return "transcript_consent_no";
  }

  for (const phrase of AFFIRMATIVE_PHRASES) {
    if (n.includes(phrase)) return "transcript_consent_yes";
  }

  if (/\byes\b/.test(n) || /\byeah\b/.test(n) || /\byep\b/.test(n) || /\baffirmative\b/.test(n)) {
    return "transcript_consent_yes";
  }

  if (/\bon\b/.test(n) && (n.includes("transcript") || n.includes("transcription") || n.includes("record"))) {
    return "transcript_consent_yes";
  }
  if (/\boff\b/.test(n) && (n.includes("transcript") || n.includes("transcription") || n.includes("record"))) {
    return "transcript_consent_no";
  }

  return "unknown";
}

function matchesAny(n: string, phrases: string[]): boolean {
  return phrases.some((p) => n.includes(p) || n.startsWith(p));
}

export function classifyActiveBoxedIntent(raw: string): BoxedVoiceIntent {
  const n = normalizeUtterance(raw);
  if (!n) return "fallback_unknown";

  if (
    matchesAny(n, [
      "hello",
      "hi malv",
      "hi there",
      "good morning",
      "good afternoon",
      "good evening",
      "hey malv"
    ])
  ) {
    return "greeting";
  }

  if (
    matchesAny(n, [
      "help",
      "what can you do",
      "what do you do",
      "how can you help",
      "capabilities",
      "commands"
    ])
  ) {
    return "help_capabilities";
  }

  if (
    matchesAny(n, [
      "are you there",
      "you there",
      "still there",
      "status",
      "listening",
      "can you hear me"
    ])
  ) {
    return "status_ping";
  }

  if (matchesAny(n, ["open dashboard", "show dashboard", "go to dashboard", "dashboard"])) {
    return "open_dashboard";
  }

  if (matchesAny(n, ["check memory", "inspect memory", "memory state", "what is in memory"])) {
    return "check_memory";
  }

  if (matchesAny(n, ["summarize this call", "summarize the call", "summary of this call", "recap this call"])) {
    return "summarize_call";
  }

  if (matchesAny(n, ["pause", "hold on", "stop listening", "quiet mode", "be quiet"])) {
    return "pause_voice";
  }

  if (matchesAny(n, ["resume", "continue", "unpause", "keep going", "start listening again"])) {
    return "resume_voice";
  }

  return "fallback_unknown";
}
