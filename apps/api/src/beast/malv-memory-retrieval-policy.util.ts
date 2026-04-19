/** User phrasing that strongly suggests stored thread / long-horizon context is relevant. */
const MEMORY_RELEVANCE_CUE = /\b(remember|recall|earlier|before|last time|what did i|you said|as we discussed|from my notes?|saved|vault|private)\b/i;

export type MalvMemoryRetrievalPolicy = "skip" | "minimal" | "full";

export function resolveMalvMemoryRetrievalPolicy(args: {
  /** When set, orchestrator overrides heuristics (vault / deliberate turns). */
  override?: MalvMemoryRetrievalPolicy | null;
  vaultScoped: boolean;
  collaborationMode: boolean;
  contextAssemblyTier: "full" | "simple";
  userMessage: string;
  /**
   * Phase 4 — adaptive floor for “long message ⇒ minimal memory” (default 200).
   * Bounded in orchestrator; lower values retrieve memory slightly earlier.
   */
  memoryCueLengthThreshold?: number;
}): MalvMemoryRetrievalPolicy {
  if (args.override) return args.override;
  if (args.vaultScoped || args.collaborationMode) return "full";
  if (args.contextAssemblyTier !== "simple") return "full";
  const m = args.userMessage.trim();
  const lenGate =
    typeof args.memoryCueLengthThreshold === "number" && Number.isFinite(args.memoryCueLengthThreshold)
      ? Math.min(280, Math.max(120, Math.round(args.memoryCueLengthThreshold)))
      : 200;
  if (MEMORY_RELEVANCE_CUE.test(m) || m.length >= lenGate) return "minimal";
  return "skip";
}
