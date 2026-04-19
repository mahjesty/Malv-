import type { MalvSemanticInterpretation } from "./semantic-interpretation.types";
import type { MalvResponsePlan } from "./malv-response-planning.util";

export type ShapeMalvFinalResponseInput = {
  response: string;
  plan: MalvResponsePlan;
  interpretation?: MalvSemanticInterpretation | null;
  preserveGuarded?: boolean;
  /**
   * When true the model's tokens were already forwarded to the client during streaming.
   * Any transformation that materially restructures or truncates the visible body must be
   * suppressed so that `assistant_done.finalContent` and persisted content match what the
   * user watched finish streaming (stream-convergence contract).
   */
  hadLiveStreamTokens?: boolean;
};

const INTERNAL_LANGUAGE_PATTERNS: RegExp[] = [
  /\bi will now\b/gi,
  /\bbased on (?:the )?system\b/gi,
  /\bpipeline\b/gi,
  /\bexecution phase\b/gi,
  /\binternal (?:routing|policy|orchestration)\b/gi
];

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripInternalLanguage(text: string): string {
  let out = text;
  for (const re of INTERNAL_LANGUAGE_PATTERNS) {
    out = out.replace(re, "");
  }
  return out.replace(/\s{2,}/g, " ").replace(/\s+([.,!?;:])/g, "$1").trim();
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function dedupeAdjacentLines(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (out.length === 0 || out[out.length - 1] !== line) out.push(line);
  }
  return out.join("\n");
}

function shapeStepByStep(text: string): string {
  const numberedLines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^#{1,6}\s+/.test(l));
  if (numberedLines.length >= 2 && numberedLines.every((l) => /^\d+\.\s+/.test(l))) {
    return text;
  }
  if (numberedLines.length >= 2 && numberedLines.every((l) => /^[-*]\s+/.test(l))) {
    return numberedLines.map((l, i) => `${i + 1}. ${l.replace(/^[-*]\s+/, "")}`).join("\n");
  }
  const sentences = splitSentences(text);
  if (sentences.length >= 2) {
    return sentences.map((s, i) => `${i + 1}. ${s}`).join("\n");
  }
  return text;
}

function shapeDirect(text: string): string {
  const sentences = splitSentences(text);
  if (sentences.length <= 2) return text;
  return `${sentences[0]} ${sentences[1]}`.trim();
}

function shapeSectioned(text: string): string {
  const trimmed = text.trim();
  if (/^#{1,3}\s+/m.test(trimmed)) return trimmed;
  const parts = trimmed.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts.join("\n\n");
  const sentences = splitSentences(trimmed);
  if (sentences.length >= 4) {
    const mid = Math.ceil(sentences.length / 2);
    return `${sentences.slice(0, mid).join(" ")}\n\n${sentences.slice(mid).join(" ")}`.trim();
  }
  return trimmed;
}

export function shapeMalvFinalResponse(input: ShapeMalvFinalResponseInput): string {
  if (input.preserveGuarded) return normalizeWhitespace(input.response ?? "");

  const raw = typeof input.response === "string" ? input.response : "";
  if (!raw.trim()) return "";

  const withoutInternal = stripInternalLanguage(raw);
  const normalized = dedupeAdjacentLines(normalizeWhitespace(withoutInternal));

  // When live tokens were already forwarded to the client, suppress any restructuring
  // pass that would produce a body materially different from the streamed accumulation.
  // Internal-language removal and whitespace normalization above are safe: they remove
  // phrases the stream-side shaper also drops or that should never be user-visible.
  if (input.hadLiveStreamTokens) {
    return normalized;
  }

  switch (input.plan.structure) {
    case "step_by_step":
      return shapeStepByStep(normalized);
    case "direct":
      if (input.interpretation?.constraints.wantsDepth) return normalized;
      return shapeDirect(normalized);
    case "sectioned":
      return shapeSectioned(normalized);
    case "adaptive":
    default:
      return normalized;
  }
}
