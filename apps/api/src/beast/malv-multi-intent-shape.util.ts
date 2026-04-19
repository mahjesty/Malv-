/**
 * Lightweight multi-intent **shaping** hints for the worker prompt (no extra pipelines).
 */

export type MalvMultiIntentAnalysis = {
  multiIntent: boolean;
  /** Up to 3 trimmed segments for internal ordering hints only */
  segments: string[];
};

const LISTISH = /^\s*(?:[-*•]|\d+[.)])\s+/m;

function splitSegments(raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  const chunks: string[] = [];
  const push = (s: string) => {
    const x = s.trim();
    if (x.length >= 8 && x.length <= 220) chunks.push(x);
  };

  for (const line of t.split(/\n+/)) {
    const u = line.trim();
    if (u.length >= 8) push(u);
  }
  if (chunks.length >= 2) return dedupeCap(chunks, 3);

  const bySemi = t
    .split(/[;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);
  if (bySemi.length >= 2) return dedupeCap(bySemi, 3);

  const byAnd = t.split(/\s+and\s+/i).map((s) => s.trim());
  if (byAnd.length >= 2) {
    const merged: string[] = [];
    for (const p of byAnd) {
      const sub = p.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length >= 8);
      if (sub.length >= 2) merged.push(...sub);
      else if (p.length >= 8) merged.push(p);
    }
    return dedupeCap(merged.length ? merged : byAnd.filter((p) => p.length >= 8), 3);
  }

  const byPunct = t
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);
  if (byPunct.length >= 2) return dedupeCap(byPunct, 3);

  return dedupeCap(chunks, 3);
}

function dedupeCap(parts: string[], cap: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const k = p.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * Heuristic multi-intent: multiple questions, substantial "and" clauses, or list-like structure.
 */
export function analyzeMalvMultiIntent(userMessage: string): MalvMultiIntentAnalysis {
  const raw = typeof userMessage === "string" ? userMessage : "";
  const t = raw.trim();
  if (t.length < 16) return { multiIntent: false, segments: [] };

  const qm = (t.match(/\?/g) ?? []).length;
  if (qm >= 2) {
    const segments = splitSegments(t);
    return { multiIntent: true, segments: segments.length ? segments : [t.slice(0, 200)] };
  }

  const partsAnd = t.split(/\s+and\s+/i);
  if (partsAnd.length >= 3) {
    const segments = splitSegments(t);
    return { multiIntent: true, segments: segments.length ? segments : [t.slice(0, 200)] };
  }
  if (
    partsAnd.length === 2 &&
    partsAnd[0]!.trim().length >= 8 &&
    partsAnd[1]!.trim().length >= 12 &&
    t.length >= 26
  ) {
    const segments = splitSegments(t);
    return { multiIntent: true, segments: segments.length ? segments : [t.slice(0, 200)] };
  }

  if (LISTISH.test(t)) {
    const segments = splitSegments(t);
    if (segments.length >= 2) return { multiIntent: true, segments };
  }

  const lines = t.split(/\n/).map((l) => l.trim()).filter((l) => l.length >= 12);
  if (lines.length >= 2 && lines.slice(0, 2).every((l) => /\?/.test(l) || /^(who|what|how|why|when|should|is|are)\b/i.test(l))) {
    return { multiIntent: true, segments: dedupeCap(lines, 3) };
  }

  return { multiIntent: false, segments: [] };
}

/**
 * Compact instructions: one reply, primary then optional "Also:" — no execution split.
 */
export function buildMalvMultiIntentCompactAnswerPromptSection(analysis: MalvMultiIntentAnalysis): string | null {
  if (!analysis.multiIntent) return null;
  const hint =
    analysis.segments.length > 0
      ? analysis.segments.map((s) => `"${s.replace(/\s+/g, " ").slice(0, 120)}"`).join("; ")
      : "(unsplit — infer exactly two asks from the user text)";
  return `### Multi-part message (shaping only; single reply)
The user likely has **more than one** ask. This is **not** a request to run multiple tool passes — produce **one** cohesive reply.
- **Order**: address **identity / who-you-are clarity** first if present, else **market or web-grounded** facts, else **visual** asks, else general — still **one** answer flow.
- **Shape**: first **short** paragraph = the **primary** ask; if a clear secondary remains, add **one** extra short paragraph beginning with **Also:** (no extra headings, no bullet walls).
- **Length**: keep the whole reply to **at most 2–3 compact paragraphs** total unless the user explicitly asked for depth.
Internal segment hints (do not quote verbatim to the user): ${hint}`;
}
