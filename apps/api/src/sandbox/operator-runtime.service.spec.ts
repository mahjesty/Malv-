import { BadRequestException } from "@nestjs/common";
import { OperatorRuntimeService } from "./operator-runtime.service";

describe("OperatorRuntimeService hardening", () => {
  const mkService = () => {
    const workspaceRoot = process.cwd().endsWith("/apps/api") ? process.cwd().replace(/\/apps\/api$/, "") : process.cwd();
    const cfg: any = {
      get: jest.fn((k: string) => {
        if (k === "OPERATOR_CMD_TIMEOUT_MS") return "1000";
        if (k === "OPERATOR_WORKSPACE_ROOT") return workspaceRoot;
        if (k === "OPERATOR_TMP_ROOT") return "/tmp";
        return undefined;
      })
    };
    const killSwitch: any = { ensureSystemOnOrThrow: jest.fn(), getState: jest.fn() };
    const realtime: any = { emitToUser: jest.fn() };
    const runtimePolicy: any = {
      evaluateTypedAction: jest.fn(async (args: any) => ({
        decision: "allow",
        normalizedParameters: args.parameters ?? {},
        rewrittenParameters: null,
        actionCategory: "execute",
        riskLevel: "low",
        reason: "ok",
        matchedRuleId: "typed_allow_default",
        policyVersionId: "pv-1"
      })),
      persistTypedActionDecision: jest.fn().mockResolvedValue({ id: "dec-1" })
    };
    const aiJobs: any = {};
    const sandboxRuns: any = { save: jest.fn(async (x: any) => x) };
    const commandRecords: any = {};
    const typedActions: any = {
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => ({ id: x.id ?? "typed-1", ...x }))
    };
    const patches: any = { create: jest.fn((x: any) => x), save: jest.fn(async (x: any) => ({ id: "patch-1", ...x })) };
    const approvals: any = {};
    const isolationProvider: any = {
      readFileIsolated: jest.fn(async () => ({
        content: "file-content",
        isolationMetadata: {
          provider: "local",
          enforcementClass: "best_effort",
          networkPolicyRequested: "deny",
          networkPolicyActual: "best_effort_env_proxy_deny",
          workspaceRoot: "/tmp/ws",
          executable: "node",
          timeoutMs: 1000,
          timeoutTriggered: false,
          outputCapTriggered: false,
          cleanupStatus: "ok"
        }
      })),
      listDirectoryIsolated: jest.fn(async () => ({
        entries: ["a.ts", "b.ts"],
        isolationMetadata: {
          provider: "local",
          enforcementClass: "best_effort",
          networkPolicyRequested: "deny",
          networkPolicyActual: "best_effort_env_proxy_deny",
          workspaceRoot: "/tmp/ws",
          executable: "node",
          timeoutMs: 1000,
          timeoutTriggered: false,
          outputCapTriggered: false,
          cleanupStatus: "ok"
        }
      })),
      writeFileIsolated: jest.fn(async () => ({
        provider: "local",
        enforcementClass: "best_effort",
        networkPolicyRequested: "deny",
        networkPolicyActual: "best_effort_env_proxy_deny",
        workspaceRoot: "/tmp/ws",
        executable: "node",
        timeoutMs: 1000,
        timeoutTriggered: false,
        outputCapTriggered: false,
        cleanupStatus: "ok"
      })),
      execute: jest.fn(async () => ({
        stdout: "ok",
        stderr: "",
        exitCode: 0,
        isolationMetadata: {
          provider: "local",
          enforcementClass: "best_effort",
          networkPolicyRequested: "deny",
          networkPolicyActual: "best_effort_env_proxy_deny",
          workspaceRoot: "/tmp/ws",
          executable: "jest",
          timeoutMs: 1000,
          timeoutTriggered: false,
          outputCapTriggered: false,
          cleanupStatus: "ok"
        }
      }))
    };
    const svc = new OperatorRuntimeService(
      cfg,
      killSwitch,
      realtime,
      runtimePolicy,
      aiJobs,
      sandboxRuns,
      commandRecords,
      typedActions,
      patches,
      approvals,
      isolationProvider
    );
    return { svc, isolationProvider, typedActions };
  };

  it("blocks legacy command execution path", async () => {
    const { svc } = mkService();
    await expect(
      svc.runCommandStep({
        sandboxRun: { id: "run-1" } as any,
        userId: "u1",
        stepIndex: 1,
        cmd: { command: "pwd" }
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects unsafe run_tests typed parameters", () => {
    const { svc } = mkService();
    const anySvc: any = svc;
    expect(() => anySvc.parseRunTestsParams({ framework: "jest", allowWatch: true })).toThrow(BadRequestException);
    expect(() => anySvc.parseRunTestsParams({ framework: "jest", updateSnapshots: true })).toThrow(BadRequestException);
    expect(() => anySvc.parseRunTestsParams({ framework: "jest", target: "../escape" })).toThrow(BadRequestException);
    expect(() => anySvc.parseRunTestsParams({ framework: "jest", target: "--config=evil.js" })).toThrow(BadRequestException);
  });

  it("builds deterministic runner invocation from typed run_tests parameters", () => {
    const { svc } = mkService();
    const anySvc: any = svc;
    const params = anySvc.parseRunTestsParams({ framework: "vitest", mode: "integration", target: "apps/api/src" });
    const cmd = anySvc.resolveTestCommand(params);
    expect(cmd).toEqual({
      file: "vitest",
      args: ["run", "--watch=false", "apps/api/src"]
    });
  });

  it("routes untrusted run_tests through isolation provider with network deny default", async () => {
    const { svc, isolationProvider, typedActions } = mkService();
    await svc.runPlan({
      sandboxRun: { id: "run-1" } as any,
      userId: "u1",
      typedActions: [{ actionType: "run_tests", parameters: { framework: "jest", mode: "unit" } }]
    });
    expect(isolationProvider.execute).toHaveBeenCalled();
    const runTestsCall = isolationProvider.execute.mock.calls.find((c: any[]) => c[0]?.executable === "jest")?.[0];
    expect(runTestsCall).toBeTruthy();
    expect(runTestsCall.allowNetwork).toBe(false);
    expect(runTestsCall.executable).toBe("jest");
    const savedRecord = typedActions.save.mock.calls[typedActions.save.mock.calls.length - 1][0];
    expect(savedRecord.outputMeta.isolation.networkPolicyRequested).toBe("deny");
    expect(savedRecord.outputMeta.isolation.enforcementClass).toBe("best_effort");
  });

  it.each([
    { actionType: "read_file", parameters: { path: "apps/api/package.json" }, executable: "node", method: "readFileIsolated" },
    { actionType: "list_directory", parameters: { path: "apps/api/src/sandbox" }, executable: "node", method: "listDirectoryIsolated" },
    { actionType: "write_file", parameters: { path: "apps/api/package.json", content: "x" }, executable: "node", method: "writeFileIsolated" },
    { actionType: "search_repo", parameters: { query: "error" }, executable: "rg" },
    { actionType: "inspect_logs", parameters: { pattern: "stack" }, executable: "rg" },
    { actionType: "get_git_status", parameters: {}, executable: "git" },
    { actionType: "get_git_diff", parameters: {}, executable: "git" },
    { actionType: "run_tests", parameters: { framework: "jest", mode: "unit" }, executable: "jest" }
  ])("routes executable action $actionType via isolation provider", async ({ actionType, parameters, executable, method }) => {
    const { svc, isolationProvider } = mkService();
    await svc.runPlan({
      sandboxRun: { id: "run-1" } as any,
      userId: "u1",
      typedActions: [{ actionType: actionType as any, parameters }]
    });
    if (method) {
      expect(isolationProvider[method]).toHaveBeenCalled();
    } else {
      const matching = isolationProvider.execute.mock.calls.find((c: any[]) => c[0]?.executable === executable)?.[0];
      expect(matching).toBeTruthy();
      expect(matching.allowNetwork).toBe(false);
    }
  });

  it("fails closed when isolation provider execution fails", async () => {
    const { svc, isolationProvider } = mkService();
    isolationProvider.execute.mockRejectedValueOnce(new Error("isolation unavailable"));
    await expect(
      svc.runPlan({
        sandboxRun: { id: "run-1" } as any,
        userId: "u1",
        typedActions: [{ actionType: "run_tests", parameters: { framework: "jest", mode: "unit" } }]
      })
    ).rejects.toThrow(/isolation unavailable/);
    expect(isolationProvider.execute).toHaveBeenCalled();
  });
});
