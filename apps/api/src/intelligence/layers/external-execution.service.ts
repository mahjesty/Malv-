import { Injectable } from "@nestjs/common";
import type { DeviceIntelligenceLayerOutput, MetaRouterInput } from "../meta-intelligence.types";

@Injectable()
export class ExternalExecutionService {
  analyze(input: MetaRouterInput, device: DeviceIntelligenceLayerOutput): DeviceIntelligenceLayerOutput {
    const unsafe = device.executionRisk === "high" || device.permissionStatus === "denied";
    const uncertain = device.executionTarget === "none" || device.bridgeRoute === "none" || device.permissionStatus === "unknown";
    const needsApproval = device.approvalRequired || unsafe || uncertain || input.riskTier !== "low";
    const targetPhase =
      device.executionTarget === "home_device"
        ? ["bridge_health_check", "sync_device_state", "dispatch_home_action"]
        : device.executionTarget === "browser"
          ? ["resolve_session", "open_or_focus_tab", "apply_browser_action"]
          : device.executionTarget === "desktop" || device.executionTarget === "phone"
            ? ["resolve_agent", "validate_runtime_policy", "dispatch_device_action"]
            : ["request_target_clarification"];
    const rollbackPlan =
      device.rollbackPlan.length > 0
        ? device.rollbackPlan
        : device.executionTarget === "home_device"
          ? ["capture_pre_action_state", "send_inverse_device_command", "validate_state_restoration", "report_recovery_status"]
          : ["capture_pre_action_state", "define_inverse_action", "reconcile_post_action_state", "report_recovery_status"];

    return {
      ...device,
      approvalRequired: needsApproval,
      confirmationStrategy: unsafe || uncertain ? "deny_and_explain" : needsApproval ? "ask_before_execute" : "auto_safe",
      executionPlan:
        unsafe || uncertain
          ? ["classify_request", "explain_block_reason", "request_safe_alternative", "provide_advisory_only_steps"]
          : ["classify_request", ...targetPhase, "checkpoint_before_action", "execute_in_sandbox", "validate_outcome"],
      rollbackPlan
    };
  }
}
