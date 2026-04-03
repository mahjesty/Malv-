import { Injectable } from "@nestjs/common";
import type { ClassifiedIntent } from "./intent-understanding.types";

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

const STANDARD_ENGINEERING_LOOP: InternalPhaseId[] = ["audit", "plan", "implement", "verify", "review"];

function phasedWithEngineeringLoop(phases: InternalPhaseId[]): InternalPhaseId[] {
  return [...STANDARD_ENGINEERING_LOOP, ...phases];
}

@Injectable()
export class ExecutionStrategyService {
  buildStrategy(classified: ClassifiedIntent): ExecutionStrategyResult {
    if (classified.ambiguity.isAmbiguous) {
      return {
        mode: "require_clarification",
        internalPhases: [],
        preferBeastWorker: false,
        riskTier: "low",
        clarificationReason: classified.ambiguity.reason ?? "ambiguous_prompt"
      };
    }

    const { primaryIntent, scopeSize, complexity } = classified;
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
