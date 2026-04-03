import { BadRequestException } from "@nestjs/common";
import { SandboxExecutionService } from "./sandbox-execution.service";

describe("SandboxExecutionService hardening", () => {
  it("rejects raw command operator plans", async () => {
    const svc = new SandboxExecutionService(
      { ensureSystemOnOrThrow: jest.fn().mockResolvedValue(undefined) } as any,
      { get: jest.fn() } as any,
      {} as any,
      {} as any,
      { create: jest.fn((x) => x), save: jest.fn(async (x) => ({ id: "run-1", ...x })) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { resolveAndBindForRun: jest.fn().mockResolvedValue({ policyDefinition: { name: "p" }, policyVersion: { version: 1 } }) } as any,
      { assertWorkspacePermissionOrThrow: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any,
      { observeSandboxRun: jest.fn(), recordJobExecution: jest.fn() } as any,
      { publish: jest.fn() } as any
    );
    await expect(
      svc.createOperatorTaskSandboxRun({
        userId: "u1",
        commands: [{ command: "echo pwn" }],
        typedActions: [],
        requiresApproval: false
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects run_tests typed action with legacy command text", async () => {
    const svc = new SandboxExecutionService(
      { ensureSystemOnOrThrow: jest.fn().mockResolvedValue(undefined) } as any,
      { get: jest.fn() } as any,
      {} as any,
      {} as any,
      { create: jest.fn((x) => x), save: jest.fn(async (x) => ({ id: "run-1", ...x })) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { resolveAndBindForRun: jest.fn().mockResolvedValue({ policyDefinition: { name: "p" }, policyVersion: { version: 1 } }) } as any,
      { assertWorkspacePermissionOrThrow: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any,
      { observeSandboxRun: jest.fn(), recordJobExecution: jest.fn() } as any,
      { publish: jest.fn() } as any
    );
    await expect(
      svc.createOperatorTaskSandboxRun({
        userId: "u1",
        commands: [],
        typedActions: [{ actionType: "run_tests", parameters: { command: "npm test" } as any }],
        requiresApproval: false
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects run_tests typed action with option-like target", async () => {
    const svc = new SandboxExecutionService(
      { ensureSystemOnOrThrow: jest.fn().mockResolvedValue(undefined) } as any,
      { get: jest.fn() } as any,
      {} as any,
      {} as any,
      { create: jest.fn((x) => x), save: jest.fn(async (x) => ({ id: "run-1", ...x })) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { resolveAndBindForRun: jest.fn().mockResolvedValue({ policyDefinition: { name: "p" }, policyVersion: { version: 1 } }) } as any,
      { assertWorkspacePermissionOrThrow: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any,
      { observeSandboxRun: jest.fn(), recordJobExecution: jest.fn() } as any,
      { publish: jest.fn() } as any
    );
    await expect(
      svc.createOperatorTaskSandboxRun({
        userId: "u1",
        commands: [],
        typedActions: [{ actionType: "run_tests", parameters: { framework: "jest", target: "--config=evil.js" } as any }],
        requiresApproval: false
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
