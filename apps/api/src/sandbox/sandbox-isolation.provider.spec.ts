import { SandboxIsolationProvider } from "./sandbox-isolation.provider";

describe("SandboxIsolationProvider", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  const mkCfg = (overrides: Record<string, string> = {}) =>
    ({
      get: jest.fn((k: string) => overrides[k])
    }) as any;

  it("labels local provider as best-effort", async () => {
    const provider = new SandboxIsolationProvider(
      mkCfg({
        SANDBOX_ISOLATION_PROVIDER: "local"
      })
    );
    await provider.onModuleInit();
    const out = await provider.execute({
      executable: "node",
      args: ["-e", "process.stdout.write('ok')"],
      cwd: process.cwd(),
      workspaceRoot: process.cwd(),
      timeoutMs: 1000,
      allowNetwork: false
    });
    expect(out.exitCode).toBe(0);
    expect(out.isolationMetadata.enforcementClass).toBe("best_effort");
    expect(out.isolationMetadata.networkPolicyRequested).toBe("deny");
  });

  it("marks timeout-triggered cleanup", async () => {
    const provider = new SandboxIsolationProvider(mkCfg({ SANDBOX_ISOLATION_PROVIDER: "local" }));
    await provider.onModuleInit();
    const out = await provider.execute({
      executable: "node",
      args: ["-e", "setTimeout(() => process.exit(0), 2000)"],
      cwd: process.cwd(),
      workspaceRoot: process.cwd(),
      timeoutMs: 50,
      allowNetwork: false
    });
    expect(out.exitCode).toBe(124);
    expect(out.isolationMetadata.timeoutTriggered).toBe(true);
    expect(out.isolationMetadata.cleanupStatus).toBe("ok");
  });

  it("marks output-cap-triggered cleanup", async () => {
    const provider = new SandboxIsolationProvider(
      mkCfg({
        SANDBOX_ISOLATION_PROVIDER: "local",
        OPERATOR_STDOUT_MAX_BYTES: "1024"
      })
    );
    await provider.onModuleInit();
    const out = await provider.execute({
      executable: "node",
      args: ["-e", "process.stdout.write('x'.repeat(5000))"],
      cwd: process.cwd(),
      workspaceRoot: process.cwd(),
      timeoutMs: 2000,
      allowNetwork: false
    });
    expect(out.exitCode).toBe(125);
    expect(out.isolationMetadata.outputCapTriggered).toBe(true);
  });

  it("builds docker invocation with network none when deny requested", () => {
    const provider = new SandboxIsolationProvider(
      mkCfg({
        SANDBOX_ISOLATION_PROVIDER: "docker",
        SANDBOX_DOCKER_IMAGE: "node:20-alpine"
      })
    ) as any;
    const inv = provider.buildDockerInvocation({
      executable: "jest",
      args: ["--ci"],
      cwd: process.cwd(),
      workspaceRoot: process.cwd(),
      timeoutMs: 1000,
      allowNetwork: false
    });
    expect(inv.file).toBe("docker");
    expect(inv.argv).toContain("--network");
    expect(inv.argv).toContain("none");
  });

  it("fails initialization in production when provider is not docker", async () => {
    process.env.NODE_ENV = "production";
    const provider = new SandboxIsolationProvider(mkCfg({ SANDBOX_ISOLATION_PROVIDER: "local" }));
    await expect(provider.onModuleInit()).rejects.toThrow(/Production requires SANDBOX_ISOLATION_PROVIDER=docker/);
  });

  it("fails initialization when docker health check fails", async () => {
    process.env.NODE_ENV = "production";
    const provider = new SandboxIsolationProvider(mkCfg({ SANDBOX_ISOLATION_PROVIDER: "docker" })) as any;
    jest.spyOn(provider, "runProbe").mockRejectedValue(new Error("docker unavailable"));
    await expect(provider.onModuleInit()).rejects.toThrow(/docker unavailable/);
  });

  it("fails execution if provider was not initialized", async () => {
    const provider = new SandboxIsolationProvider(mkCfg({ SANDBOX_ISOLATION_PROVIDER: "local" }));
    await expect(
      provider.execute({
        executable: "node",
        args: ["-e", "process.exit(0)"],
        cwd: process.cwd(),
        workspaceRoot: process.cwd(),
        timeoutMs: 1000,
        allowNetwork: false
      })
    ).rejects.toThrow(/not initialized/);
  });
});
