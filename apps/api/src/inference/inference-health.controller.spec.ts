import { InferenceHealthController } from "./inference-health.controller";

describe("InferenceHealthController", () => {
  const localOff = { isEnabled: () => false, probeHealth: jest.fn() };

  it("blocks non-admin callers", async () => {
    const controller = new InferenceHealthController(
      { getAdminSettingsPayload: jest.fn().mockResolvedValue({ effectiveConfig: {}, effectiveBackend: null, configSource: "env" }) } as any,
      { health: jest.fn() } as any,
      localOff as any
    );
    const out = await controller.getInferenceHealth({ user: { role: "member" } } as any);
    expect(out).toEqual({ ok: false, error: "Forbidden" });
  });

  it("redacts worker detail even for admin", async () => {
    const controller = new InferenceHealthController(
      {
        getAdminSettingsPayload: jest.fn().mockResolvedValue({
          effectiveConfig: { baseUrl: "https://host.example/v1" },
          effectiveBackend: "openai",
          configSource: "env",
          configRevision: "env:v3:test",
          primaryAuthority: "db_compat"
        })
      } as any,
      {
        health: jest.fn().mockResolvedValue({
          inferenceReady: true,
          inferenceConfigured: true,
          fallbackEnabled: false,
          fallbackActive: false,
          selectedModel: "gpt-test",
          detail: { internal: "sensitive" },
          runtimeConfigRevision: "env:v3:test"
        })
      } as any,
      localOff as any
    );

    const out = await controller.getInferenceHealth({ user: { role: "admin" } } as any);
    expect(out.ok).toBe(true);
    const admin = out as Record<string, unknown>;
    expect(admin.workerDetail).toBeNull();
    expect(admin.malvLocalOpenAiCompatible).toBeNull();
  });

  it("includes malvLocalOpenAiCompatible probe when local tier is enabled", async () => {
    const localInference = {
      isEnabled: jest.fn().mockReturnValue(true),
      probeHealth: jest.fn().mockResolvedValue({
        ok: true,
        reachable: true,
        detail: "GET /v1/models HTTP 200",
        checkedPath: "/v1/models",
        baseUrl: "http://127.0.0.1:8081"
      })
    };
    const controller = new InferenceHealthController(
      {
        getAdminSettingsPayload: jest.fn().mockResolvedValue({
          effectiveConfig: {},
          effectiveBackend: null,
          configSource: "env",
          configRevision: "env:v3:x",
          primaryAuthority: "db_compat"
        })
      } as any,
      {
        health: jest.fn().mockResolvedValue({
          inferenceReady: true,
          inferenceConfigured: true,
          fallbackEnabled: false,
          fallbackActive: false,
          selectedModel: "gpt-test"
        })
      } as any,
      localInference as any
    );
    const out = await controller.getInferenceHealth({ user: { role: "admin" } } as any);
    expect(out.ok).toBe(true);
    const admin = out as Record<string, unknown>;
    expect(admin.malvLocalOpenAiCompatible).toEqual(
      expect.objectContaining({ ok: true, checkedPath: "/v1/models", baseUrl: "http://127.0.0.1:8081" })
    );
    expect(localInference.probeHealth).toHaveBeenCalled();
  });
});
