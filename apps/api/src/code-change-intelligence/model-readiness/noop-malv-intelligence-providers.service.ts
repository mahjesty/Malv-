import { Injectable } from "@nestjs/common";
import type { MalvReasoningProvider, MalvPlanningProvider, MalvVisionCritiqueProvider } from "./malv-intelligence-providers";
import type {
  CodebaseAuditContractInput,
  CodebaseAuditContractOutput,
  BugDetectionContractInput,
  BugDetectionContractOutput,
  FixPlanningContractInput,
  FixPlanningContractOutput,
  DesignCritiqueContractInput,
  DesignCritiqueContractOutput,
  PatchReviewSynthesisContractInput,
  PatchReviewSynthesisContractOutput,
  ChangePlanningContractInput,
  ChangePlanningContractOutput,
  DesignStrategyContractInput,
  DesignStrategyContractOutput,
  RenderedUiCritiqueContractInput,
  RenderedUiCritiqueContractOutput
} from "./malv-intelligence-contracts";

@Injectable()
export class NoopMalvReasoningProvider implements MalvReasoningProvider {
  readonly providerId = "noop_reasoning";

  async augmentCodebaseAudit(_input: CodebaseAuditContractInput, _heuristic: CodebaseAuditContractOutput) {
    return null;
  }
  async augmentBugDetection(_input: BugDetectionContractInput, _heuristic: BugDetectionContractOutput) {
    return null;
  }
  async augmentFixPlanning(_input: FixPlanningContractInput, _heuristic: FixPlanningContractOutput) {
    return null;
  }
  async augmentDesignCritique(_input: DesignCritiqueContractInput, _heuristic: DesignCritiqueContractOutput) {
    return null;
  }
  async augmentPatchReviewSynthesis(_input: PatchReviewSynthesisContractInput, _heuristic: PatchReviewSynthesisContractOutput) {
    return null;
  }
}

@Injectable()
export class NoopMalvPlanningProvider implements MalvPlanningProvider {
  readonly providerId = "noop_planning";

  async augmentChangePlan(_input: ChangePlanningContractInput, _heuristic: ChangePlanningContractOutput) {
    return null;
  }
  async augmentDesignStrategy(_input: DesignStrategyContractInput, _heuristic: DesignStrategyContractOutput) {
    return null;
  }
}

@Injectable()
export class NoopMalvVisionCritiqueProvider implements MalvVisionCritiqueProvider {
  readonly providerId = "noop_vision_critique";

  async augmentRenderedUiCritique(_input: RenderedUiCritiqueContractInput, _heuristic: RenderedUiCritiqueContractOutput) {
    return null;
  }
}
