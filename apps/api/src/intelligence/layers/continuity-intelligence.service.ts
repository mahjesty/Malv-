import { Injectable } from "@nestjs/common";
import type { ContinuityIntelligenceLayerOutput, MetaRouterInput } from "../meta-intelligence.types";

type ContinuityBridgeState = {
  lastSurface: "chat" | "call" | "execution" | "device" | null;
  lastIntentType: "command" | "question" | "emotional_signal" | "mixed" | null;
  lastExecutionTarget: MetaRouterInput["lastExecutionTarget"];
  lastTaskSummary: string | null;
  lastContinuityState: ContinuityIntelligenceLayerOutput["continuityState"] | null;
};

@Injectable()
export class ContinuityIntelligenceService {
  private bridgeState: ContinuityBridgeState = {
    lastSurface: null,
    lastIntentType: null,
    lastExecutionTarget: null,
    lastTaskSummary: null,
    lastContinuityState: null
  };

  getBridgeState(): ContinuityBridgeState {
    return { ...this.bridgeState };
  }

  resetBridgeState(): void {
    this.bridgeState = {
      lastSurface: null,
      lastIntentType: null,
      lastExecutionTarget: null,
      lastTaskSummary: null,
      lastContinuityState: null
    };
  }

  updateBridgeState(patch: Partial<ContinuityBridgeState>): void {
    this.bridgeState = { ...this.bridgeState, ...patch };
  }

  analyze(input: MetaRouterInput): ContinuityIntelligenceLayerOutput {
    const safeInput = (input ?? {}) as MetaRouterInput;
    const effective = {
      ...safeInput,
      lastSurface: safeInput.lastSurface ?? this.bridgeState.lastSurface,
      lastIntentType: safeInput.lastIntentType ?? this.bridgeState.lastIntentType,
      lastExecutionTarget: safeInput.lastExecutionTarget ?? this.bridgeState.lastExecutionTarget,
      lastTaskSummary: safeInput.lastTaskSummary ?? this.bridgeState.lastTaskSummary,
      lastContinuityState: safeInput.lastContinuityState ?? this.bridgeState.lastContinuityState
    };
    const hasCallSurface = Boolean(safeInput.callId) || safeInput.inputMode === "voice" || safeInput.inputMode === "video";
    const hasTransition = hasCallSurface || Boolean(safeInput.requestedExternalExecution) || safeInput.activeSurface === "mixed" || Boolean(effective.lastSurface);
    const activeSurface = safeInput.activeSurface ?? (safeInput.inputMode === "voice" || safeInput.inputMode === "video" ? "call" : "chat");
    const contextTransferMap: string[] = [];
    if ((activeSurface === "chat" || activeSurface === "mixed" || activeSurface === "call") && hasCallSurface) {
      contextTransferMap.push("chat_to_call_continuity");
    }
    if (hasCallSurface && safeInput.requestedExternalExecution) {
      contextTransferMap.push("call_to_task_continuity");
    }
    if (safeInput.requestedExternalExecution) contextTransferMap.push("task_to_device_continuity");
    if (safeInput.activeDevice && safeInput.activeDevice !== "unknown") contextTransferMap.push("multi_device_session");
    if (safeInput.vaultScoped) contextTransferMap.push("vault_context_boundary");
    if (effective.lastSurface === "call" && activeSurface === "execution") contextTransferMap.push("call_to_task_continuity");
    if (effective.lastSurface === "execution" && safeInput.activeDevice && safeInput.activeDevice !== "unknown") {
      contextTransferMap.push("task_to_device_continuity");
    }

    const continuityState: ContinuityIntelligenceLayerOutput["continuityState"] =
      hasTransition && contextTransferMap.length === 0 ? "recovery_needed" : hasTransition ? "transitioning" : "stable";

    const output: ContinuityIntelligenceLayerOutput = {
      continuityState,
      activeSurface,
      contextTransferMap: contextTransferMap.length > 0 ? contextTransferMap : ["no_transfer_required"],
      vaultBoundaryState: safeInput.vaultScoped ? (safeInput.requestedExternalExecution ? "strict_isolation" : "active_guarded") : "inactive",
      sessionScope: safeInput.activeDevice && safeInput.activeDevice !== "unknown" ? "multi_device" : hasTransition ? "cross_surface" : "single_surface",
      continuityHealth:
        contextTransferMap.length >= 2 ? "strong" : contextTransferMap.length === 1 ? "partial" : hasTransition ? "weak" : "strong"
    };

    if (safeInput.vaultScoped && continuityState === "recovery_needed") {
      this.resetBridgeState();
    } else {
      this.bridgeState = {
        lastSurface:
          output.activeSurface === "execution"
            ? "execution"
            : output.activeSurface === "call"
              ? "call"
              : output.activeSurface === "mixed"
                  ? safeInput.requestedExternalExecution
                  ? "execution"
                  : "call"
                : "chat",
        lastIntentType: effective.lastIntentType ?? null,
        lastExecutionTarget: effective.lastExecutionTarget ?? null,
        lastTaskSummary: (safeInput.requestText ?? "").slice(0, 160) || effective.lastTaskSummary || null,
        lastContinuityState: continuityState
      };
    }

    return output;
  }
}
