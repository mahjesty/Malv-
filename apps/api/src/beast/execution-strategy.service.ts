import { Injectable } from "@nestjs/common";
import type { ClassifiedIntent, MalvIntentAmbiguity, MalvIntentKind } from "./intent-understanding.types";
import { messageLooksLikeKnowledgeOrCasualQuestion } from "./intent-understanding.service";

const INTENT_ORDER: MalvIntentKind[] = [
  "full_product_build",
  "feature_build",
  "bug_fix",
  "improvement_refactor",
  "frontend_design",
  "backend_logic",
  "system_upgrade"
];

export type ExecutionStrategyTurnContext = {
  rawUserMessage: string;
  /** Operator / workflow channel — always use full engineering scaffolding. */
  operatorPhase?: string | null;
  /** Super Fix and other explicit repair flows must not use the lightweight companion path. */
  superFix?: boolean;
};

/** Optional post-assembly inputs (e.g. semantic interpretation layer) — backward compatible when omitted. */
export type ExecutionStrategyBuildOptions = {
  /**
   * Resolved ambiguity after broad/clarification policy — avoids mutating {@link ClassifiedIntent}
   * before re-evaluating strategy.
   */
  ambiguityEffective?: MalvIntentAmbiguity;
};

function maxIntentScore(classified: ClassifiedIntent): number {
  return Math.max(...INTENT_ORDER.map((k) => classified.scores[k]));
}

/**
 * Lightweight companion turns: no injected multi-phase engineering loop in the worker prompt.
 * Conservative — when uncertain, returns false so coding/build/debug paths keep richer scaffolding.
 */
export function isCompanionLightTurn(classified: ClassifiedIntent, ctx: ExecutionStrategyTurnContext): boolean {
  if (ctx.superFix) return false;
  if (ctx.operatorPhase && String(ctx.operatorPhase).trim()) return false;
  if (classified.ambiguity.isAmbiguous) return false;
  if (classified.scopeSize === "large" || classified.complexity === "high") return false;

  const maxScore = maxIntentScore(classified);
  if (maxScore >= 3) return false;

  const m = ctx.rawUserMessage.trim();
  const codingOrChangeSignals =
    /\b(code|debug|stack\s*trace|stacktrace|typescript|javascript|python|react|nestjs|endpoint|prisma|sql|git\b|commit|patch|pull request|refactor|deploy|dockerfile|kubernetes|k8s|terraform|ci\s*\/\s*cd|npm\b|yarn|pnpm|build\b|jest|pytest|eslint)\b/i.test(
      m
    );
  const defectOrDebugSignals =
    /\b(error|fail|failed|failing|broken|crash|stack\s*trace|stacktrace|debug|exception|doesn'?t work|not working)\b/i.test(m);

  // Coding-adjacent failure/debug turns should keep engineering scaffolding even when intent scores are flat.
  if (codingOrChangeSignals && defectOrDebugSignals) return false;

  if (maxScore >= 2 && codingOrChangeSignals) return false;

  if (maxScore === 0 && classified.scopeSize === "small") {
    if (codingOrChangeSignals && defectOrDebugSignals) return false;
    return true;
  }

  if (maxScore <= 1 && classified.scopeSize === "small") {
    if (messageLooksLikeKnowledgeOrCasualQuestion(m) && !defectOrDebugSignals) return true;
    if (m.length < 96 && !codingOrChangeSignals) return true;
  }

  if (maxScore <= 1 && classified.scopeSize === "medium" && messageLooksLikeKnowledgeOrCasualQuestion(m) && m.length < 220) {
    return true;
  }

  return false;
}

export type ExecutionStrategyMode = "single_step" | "phased" | "require_clarification";

export type InternalPhaseId =
  | "audit"
  | "plan"
  | "implement"
  | "verify"
  | "review"
  | "architecture"
  | "core_backend"
  | "core_frontend"
  | "feature_modules"
  | "ux_polish"
  | "optimization";

export type ExecutionStrategyResult = {
  mode: ExecutionStrategyMode;
  /** Ordered internal phases — injected into prompts only; not a user checklist. */
  internalPhases: InternalPhaseId[];
  /** Prefer worker "beast" mode for heavy prompts. */
  preferBeastWorker: boolean;
  riskTier: "low" | "medium" | "high";
  clarificationReason?: string;
};

const FULL_PRODUCT_PHASES: InternalPhaseId[] = [
  "architecture",
  "core_backend",
  "core_frontend",
  "feature_modules",
  "ux_polish",
  "optimization"
];

/** Exported for confidence-tier correction — same loop as heavy single-step turns. */
export const STANDARD_ENGINEERING_LOOP: InternalPhaseId[] = ["audit", "plan", "implement", "verify", "review"];

function phasedWithEngineeringLoop(phases: InternalPhaseId[]): InternalPhaseId[] {
  return [...STANDARD_ENGINEERING_LOOP, ...phases];
}

function shouldForceStructuredBuildPhases(args: {
  classified: ClassifiedIntent;
  rawUserMessage: string;
}): boolean {
  const m = args.rawUserMessage.toLowerCase();
  const buildKeywords =
    /\b(build|create|develop|generate|scaffold|ship)\b.*\b(website|web app|saas|dashboard|admin panel|platform|full[- ]stack|backend|frontend)\b/.test(
      m
    ) || /\b(auth|authentication|database|schema|api routes?|deployment|integration)\b/.test(m);
  const codeGenContext = /\b(code|implement|endpoint|component|service|migration|controller|prisma|nestjs|react)\b/.test(m);
  const longMessage = m.length >= 180;
  const broadIntent = args.classified.primaryIntent === "feature_build" || args.classified.primaryIntent === "full_product_build";
  const mediumOrLarge = args.classified.scopeSize === "medium" || args.classified.scopeSize === "large";
  return broadIntent && mediumOrLarge && buildKeywords && (longMessage || codeGenContext);
}

@Injectable()
export class ExecutionStrategyService {
  buildStrategy(
    classified: ClassifiedIntent,
    turnCtx?: ExecutionStrategyTurnContext,
    opts?: ExecutionStrategyBuildOptions
  ): ExecutionStrategyResult {
    const c: ClassifiedIntent =
      opts?.ambiguityEffective !== undefined ? { ...classified, ambiguity: opts.ambiguityEffective } : classified;
    const rawUserMessage = turnCtx?.rawUserMessage ?? "";
    if (c.ambiguity.isAmbiguous) {
      return {
        mode: "require_clarification",
        internalPhases: [],
        preferBeastWorker: false,
        riskTier: "low",
        clarificationReason: c.ambiguity.reason ?? "ambiguous_prompt"
      };
    }

    if (turnCtx && isCompanionLightTurn(c, turnCtx)) {
      return {
        mode: "single_step",
        internalPhases: [],
        preferBeastWorker: false,
        riskTier: "low"
      };
    }

    const { primaryIntent, scopeSize, complexity } = c;
    if (
      rawUserMessage &&
      shouldForceStructuredBuildPhases({
        classified: c,
        rawUserMessage
      })
    ) {
      return {
        mode: "phased",
        internalPhases: phasedWithEngineeringLoop([
          "architecture",
          "core_backend",
          "feature_modules",
          "core_frontend",
          "ux_polish",
          "optimization"
        ]),
        preferBeastWorker: true,
        riskTier: complexity === "high" ? "high" : "medium"
      };
    }

    const large = scopeSize === "large";
    const high = complexity === "high";
    const mediumOrLarge = scopeSize === "medium" || large;

    if (primaryIntent === "full_product_build") {
      return {
        mode: "phased",
        internalPhases: phasedWithEngineeringLoop(FULL_PRODUCT_PHASES),
        preferBeastWorker: true,
        riskTier: "high"
      };
    }

    if (primaryIntent === "system_upgrade" && (large || high)) {
      return {
        mode: "phased",
        internalPhases: phasedWithEngineeringLoop(["architecture", "optimization"]),
        preferBeastWorker: true,
        riskTier: high ? "high" : "medium"
      };
    }

    if (primaryIntent === "feature_build" && large) {
      return {
        mode: "phased",
        internalPhases: phasedWithEngineeringLoop(["architecture", "core_backend", "core_frontend", "feature_modules"]),
        preferBeastWorker: true,
        riskTier: "medium"
      };
    }

    if (primaryIntent === "feature_build" && mediumOrLarge && !large) {
      return {
        mode: "single_step",
        internalPhases: [...STANDARD_ENGINEERING_LOOP],
        preferBeastWorker: complexity !== "low",
        riskTier: complexity === "high" ? "high" : "medium"
      };
    }

    if (primaryIntent === "bug_fix" && scopeSize === "small" && complexity !== "high") {
      return {
        mode: "single_step",
        internalPhases: [...STANDARD_ENGINEERING_LOOP],
        preferBeastWorker: false,
        riskTier: "low"
      };
    }

    if (primaryIntent === "improvement_refactor" && mediumOrLarge) {
      return {
        mode: "phased",
        internalPhases: phasedWithEngineeringLoop(["architecture", "optimization"]),
        preferBeastWorker: true,
        riskTier: "medium"
      };
    }

    if (primaryIntent === "improvement_refactor") {
      return {
        mode: "single_step",
        internalPhases: [...STANDARD_ENGINEERING_LOOP],
        preferBeastWorker: false,
        riskTier: "low"
      };
    }

    if (primaryIntent === "frontend_design" || primaryIntent === "backend_logic") {
      return {
        mode: mediumOrLarge ? "phased" : "single_step",
        internalPhases: mediumOrLarge
          ? phasedWithEngineeringLoop(
              primaryIntent === "frontend_design"
                ? ["architecture", "core_frontend", "ux_polish"]
                : ["architecture", "core_backend", "optimization"]
            )
          : [...STANDARD_ENGINEERING_LOOP],
        preferBeastWorker: mediumOrLarge,
        riskTier: mediumOrLarge ? "medium" : "low"
      };
    }

    return {
      mode: "single_step",
      internalPhases: [...STANDARD_ENGINEERING_LOOP],
      preferBeastWorker: large || high,
      riskTier: high ? "high" : mediumOrLarge ? "medium" : "low"
    };
  }
}
