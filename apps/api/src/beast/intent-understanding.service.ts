import { Injectable } from "@nestjs/common";
import type { MalvInputMetadata } from "./chat-context-assembly.service";
import type {
  ClassifiedIntent,
  MalvComplexity,
  MalvDomain,
  MalvIntentKind,
  MalvScopeSize
} from "./intent-understanding.types";
import { resolveBroadPromptExecutionPolicy, shouldTreatClarificationReliefAsUnsafe } from "./malv-broad-request-resolution.util";

const INTENT_ORDER: MalvIntentKind[] = [
  "full_product_build",
  "feature_build",
  "bug_fix",
  "improvement_refactor",
  "frontend_design",
  "backend_logic",
  "system_upgrade"
];

function emptyScores(): Record<MalvIntentKind, number> {
  return {
    full_product_build: 0,
    feature_build: 0,
    bug_fix: 0,
    improvement_refactor: 0,
    frontend_design: 0,
    backend_logic: 0,
    system_upgrade: 0
  };
}

function deriveScopeSize(message: string, scores: Record<MalvIntentKind, number>): MalvScopeSize {
  const m = message.trim();
  const len = m.length;
  if (len > 520) return "large";
  if (scores.full_product_build >= 4) return "large";
  if (/\b(entire|whole|full|complete|from scratch|greenfield|platform|marketplace|ecosystem)\b/i.test(m)) {
    return "large";
  }
  if (len > 220 || (m.split(/\band\b/gi).length ?? 0) > 3) return "medium";
  if (len < 90 && !/\n/.test(m)) return "small";
  return "medium";
}

function deriveComplexity(message: string, scores: Record<MalvIntentKind, number>): MalvComplexity {
  const m = message.toLowerCase();
  if (
    /\b(auth|oauth|jwt|payment|stripe|billing|trading|exchange|wallet|crypto|blockchain|multi[- ]tenant|hipaa|pci|gdpr)\b/.test(
      m
    )
  ) {
    return "high";
  }
  if (scores.full_product_build >= 3 || scores.system_upgrade >= 4) return "high";
  if (scores.feature_build >= 3 && m.length > 200) return "medium";
  if (scores.bug_fix >= 3 && m.length < 160) return "low";
  if (/\b(refactor|migrate|kubernetes|k8s|terraform|distributed|scale)\b/.test(m)) return "medium";
  return "medium";
}

function deriveDomains(message: string, scores: Record<MalvIntentKind, number>): MalvDomain[] {
  const m = message.toLowerCase();
  const set = new Set<MalvDomain>();
  if (
    scores.frontend_design >= 2 ||
    /\b(ui|ux|css|tailwind|react|vue|svelte|component|layout|responsive|design|screen|page)\b/.test(m)
  ) {
    set.add("frontend");
  }
  if (
    scores.backend_logic >= 2 ||
    /\b(api|endpoint|graphql|rest|server|database|db|sql|prisma|orm|nestjs|lambda|worker)\b/.test(m)
  ) {
    set.add("backend");
  }
  if (scores.system_upgrade >= 2 || /\b(docker|k8s|kubernetes|terraform|ci|cd|deploy|infra|aws|gcp)\b/.test(m)) {
    set.add("infra");
  }
  if (/\b(user flow|wireframe|journey|accessibility|a11y|usability|prototype)\b/.test(m) || scores.frontend_design >= 3) {
    set.add("ux");
  }
  if (set.size === 0) {
    if (scores.full_product_build >= 2 || scores.feature_build >= 2) {
      set.add("frontend");
      set.add("backend");
    } else if (scores.bug_fix >= 2) {
      set.add("backend");
    }
  }
  return Array.from(set);
}

const VAGUE_ONLY = /^(fix(\s+it)?|help|update|change(\s+it)?|do\s+it|ok\.?|thanks?|hmm\.?)$/i;

/** Short factual / knowledge questions should reach a real model, not autonomous clarification. */
export function messageLooksLikeKnowledgeOrCasualQuestion(trimmed: string): boolean {
  const m = trimmed.toLowerCase();
  if (/\?/.test(trimmed)) return true;
  if (
    /\b(what|who|when|where|why|how)\b/i.test(trimmed) ||
    /\b(explain|define|describe|meaning|difference between|compare|tell me about)\b/i.test(m)
  ) {
    return true;
  }
  if (/\b(teach\s+me|show\s+me|walk\s+me\s+through|talk\s+me\s+through|step\s+by\s+step|brainstorm|surprise\s+me|pick\s+one)\b/i.test(m)) {
    return true;
  }
  if (/^(what'?s|whats|what is|who is|how (do|does|can|would)|can you explain|could you explain)\b/.test(m)) {
    return true;
  }
  // Explicit reasoning / approach / debugging intent — user is asking MALV to think, not asking for clarification.
  if (
    /\b(debug(?:ging)?|diagnos[ei]|think\s+through|deep\s+think(?:ing)?|reason\s+through|work\s+through|analyz[ei]|investigate|audit|review\s+this|evaluate\s+this)\b/i.test(m)
  ) {
    return true;
  }
  return false;
}

function scoreIntents(message: string, inputMeta?: MalvInputMetadata | null): Record<MalvIntentKind, number> {
  const scores = emptyScores();
  const m = message.toLowerCase().trim();

  if (inputMeta?.operatorPhase && String(inputMeta.operatorPhase).trim()) {
    scores.feature_build += 1;
  }

  if (
    /\b(build|create|make|develop|launch)\b.*\b(app|application|platform|product|saas|mvp|dashboard|portal|website|marketplace)\b/.test(
      m
    ) ||
    /\b(greenfield|from scratch|start to finish|end[- ]to[- ]end)\b/.test(m) ||
    /\b(crypto|trading)\s+(app|platform|exchange|bot)\b/.test(m) ||
    /\btrading\s+platform\b/.test(m)
  ) {
    scores.full_product_build += 5;
  }
  if (/\b(full|entire)\s+(stack|product|system|application)\b/.test(m)) scores.full_product_build += 3;

  if (
    /\b(add|implement|introduce|support|extend)\b.*\b(feature|endpoint|page|module|integration)\b/.test(m) ||
    /\bnew\s+(feature|screen|page|api|endpoint)\b/.test(m)
  ) {
    scores.feature_build += 4;
  }
  if (/\bfeature\b/.test(m) && m.length < 400) scores.feature_build += 1;

  if (
    /\b(bug|broken|crash|regression|doesn'?t work|not working|fails?|error|exception|stack trace|stacktrace)\b/.test(m)
  ) {
    scores.bug_fix += 5;
  }
  if (/\bfix\b/.test(m)) scores.bug_fix += 2;

  if (/\b(refactor|clean up|cleaner|restructure|tech debt|dedupe|simplify architecture)\b/.test(m)) {
    scores.improvement_refactor += 5;
  }
  if (/\b(optimi[sz]e|performance|readability)\b/.test(m)) scores.improvement_refactor += 2;

  if (
    /\b(ui|ux|layout|styling|css|theme|design system|figma|responsive|component library)\b/.test(m) &&
    !scores.full_product_build
  ) {
    scores.frontend_design += 3;
  }

  if (
    /\b(api|backend|server|database|migration|schema|orm|authz|business logic)\b/.test(m) &&
    scores.full_product_build < 3
  ) {
    scores.backend_logic += 3;
  }

  if (
    /\b(upgrade|bump|version bump|migrate to|deprecat|framework upgrade|node \d+|python \d+)\b/.test(m) ||
    /\b(kubernetes|k8s|terraform|helm|infra structure|infrastructure)\b/.test(m)
  ) {
    scores.system_upgrade += 4;
  }

  return scores;
}

function pickPrimary(scores: Record<MalvIntentKind, number>): MalvIntentKind {
  let best: MalvIntentKind = "feature_build";
  let bestScore = -1;
  for (const k of INTENT_ORDER) {
    const s = scores[k];
    if (s > bestScore) {
      bestScore = s;
      best = k;
    }
  }
  if (bestScore <= 0) return "feature_build";
  return best;
}

function topTwoGap(scores: Record<MalvIntentKind, number>): { first: MalvIntentKind; second: MalvIntentKind; gap: number } {
  const entries = (Object.entries(scores) as [MalvIntentKind, number][]).sort((a, b) => b[1] - a[1]);
  const first = entries[0][0];
  const second = entries[1][0];
  return { first, second, gap: entries[0][1] - entries[1][1] };
}

@Injectable()
export class IntentUnderstandingService {
  /**
   * Rule-based classification only — no model calls. Scores are exposed for tests and audits.
   */
  classify(userMessage: string, inputMeta?: MalvInputMetadata | null): ClassifiedIntent {
    const trimmed = userMessage.trim();
    const scores = scoreIntents(trimmed, inputMeta);
    const primaryIntent = pickPrimary(scores);
    const scopeSize = deriveScopeSize(trimmed, scores);
    const complexity = deriveComplexity(trimmed, scores);
    const domains = deriveDomains(trimmed, scores);

    const { gap } = topTwoGap(scores);
    const short = trimmed.length < 18;
    const vagueOnly = VAGUE_ONLY.test(trimmed);
    const lowSignal = Math.max(...INTENT_ORDER.map((k) => scores[k])) <= 1 && trimmed.length < 80;

    let isAmbiguous = false;
    let reason: string | undefined;

    if (vagueOnly) {
      isAmbiguous = true;
      reason = "message_too_vague";
    } else if (short && lowSignal && !messageLooksLikeKnowledgeOrCasualQuestion(trimmed)) {
      isAmbiguous = true;
      reason = "short_low_signal";
    } else if (
      trimmed.length < 140 &&
      gap <= 1 &&
      Math.max(...INTENT_ORDER.map((k) => scores[k])) >= 2 &&
      !messageLooksLikeKnowledgeOrCasualQuestion(trimmed)
    ) {
      isAmbiguous = true;
      reason = "intent_tie";
    }

    if (isAmbiguous && !shouldTreatClarificationReliefAsUnsafe(trimmed)) {
      const broadPolicy = resolveBroadPromptExecutionPolicy({ userMessage: trimmed });
      if (broadPolicy.action === "proceed") {
        isAmbiguous = false;
        reason = undefined;
      }
    }

    return {
      primaryIntent,
      scores,
      scopeSize,
      complexity,
      domains,
      ambiguity: { isAmbiguous, reason }
    };
  }
}
