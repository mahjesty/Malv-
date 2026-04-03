import { ConfigService } from "@nestjs/config";
import {
  CciValidationExecutionBridge,
  isCciPostImplementationValidationEnabled
} from "./cci-validation-execution.bridge";
import type { SandboxExecutionService } from "../sandbox/sandbox-execution.service";

describe("CciValidationExecutionBridge", () => {
  it("isCciPostImplementationValidationEnabled is false by default", () => {
    const cfg = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    expect(isCciPostImplementationValidationEnabled(cfg)).toBe(false);
  });

  it("isCciPostImplementationValidationEnabled respects truthy env strings", () => {
    for (const v of ["1", "true", "yes", "TRUE"]) {
      const cfg = { get: jest.fn().mockReturnValue(v) } as unknown as ConfigService;
      expect(isCciPostImplementationValidationEnabled(cfg)).toBe(true);
    }
  });

  it("maybeRunPostImplementationValidation returns null when disabled", async () => {
    const cfg = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    const sandbox = {} as unknown as SandboxExecutionService;
    const bridge = new CciValidationExecutionBridge(cfg, sandbox);
    await expect(bridge.maybeRunPostImplementationValidation({ userId: "u1", workspaceId: "ws1" })).resolves.toBeNull();
  });

  it("maybeRunPostImplementationValidation returns not_run entries when workspace id missing", async () => {
    const cfg = { get: jest.fn().mockImplementation((k: string) => (k === "CCI_POST_IMPLEMENTATION_VALIDATION" ? "true" : undefined)) } as unknown as ConfigService;
    const sandbox = { runCciInlineOperatorValidationAction: jest.fn() } as unknown as SandboxExecutionService;
    const bridge = new CciValidationExecutionBridge(cfg, sandbox);
    const out = await bridge.maybeRunPostImplementationValidation({ userId: "u1", workspaceId: null });
    expect(out?.skippedReason).toBe("cci_validation_no_workspace_on_change_request");
    expect(out?.typecheck?.status).toBe("not_run");
    expect(out?.lint?.status).toBe("not_run");
    expect(out?.tests?.status).toBe("not_run");
    expect(sandbox.runCciInlineOperatorValidationAction).not.toHaveBeenCalled();
  });

  it("maps sandbox typed action completed + exit 0 to passed", async () => {
    const cfg = {
      get: jest.fn().mockImplementation((k: string) => {
        if (k === "CCI_POST_IMPLEMENTATION_VALIDATION") return "true";
        if (k === "OPERATOR_WORKSPACE_ROOT") return process.cwd();
        return undefined;
      })
    } as unknown as ConfigService;
    const sandbox = {
      runCciInlineOperatorValidationAction: jest.fn().mockResolvedValue({
        status: "completed",
        outputSummary: "ok",
        outputMeta: { exitCode: 0, stdout: "x", stderr: "" }
      })
    } as unknown as SandboxExecutionService;
    const bridge = new CciValidationExecutionBridge(cfg, sandbox);
    const out = await bridge.maybeRunPostImplementationValidation({ userId: "u1", workspaceId: "ws-1" });
    expect(out?.typecheck?.status).toBe("passed");
    expect(out?.lint?.status).toBe("passed");
    expect(out?.tests?.status).toBe("passed");
    expect(sandbox.runCciInlineOperatorValidationAction).toHaveBeenCalledTimes(3);
  });

  it("maps non-zero exit on completed typed action to failed", async () => {
    const cfg = {
      get: jest.fn().mockImplementation((k: string) => {
        if (k === "CCI_POST_IMPLEMENTATION_VALIDATION") return "true";
        if (k === "OPERATOR_WORKSPACE_ROOT") return process.cwd();
        return undefined;
      })
    } as unknown as ConfigService;
    const sandbox = {
      runCciInlineOperatorValidationAction: jest.fn().mockResolvedValue({
        status: "completed",
        outputSummary: "tsc errors",
        outputMeta: { exitCode: 2, stdout: "", stderr: "error TS" }
      })
    } as unknown as SandboxExecutionService;
    const bridge = new CciValidationExecutionBridge(cfg, sandbox);
    const out = await bridge.maybeRunPostImplementationValidation({ userId: "u1", workspaceId: "ws-1" });
    expect(out?.typecheck?.status).toBe("failed");
  });
});
