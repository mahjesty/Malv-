import { InferenceHealthController } from "./inference-health.controller";

describe("InferenceHealthController", () => {
  it("blocks non-admin callers", async () => {
    const controller = new InferenceHealthController(
      { getAdminSettingsPayload: jest.fn().mockResolvedValue({ effectiveConfig: {}, effectiveBackend: null, configSource: "env" }) } as any,
      { health: jest.fn() } as any
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
          configSource: "env"
        })
      } as any,
      {
        health: jest.fn().mockResolvedValue({
          inferenceReady: true,
          inferenceConfigured: true,
          fallbackEnabled: false,
          fallbackActive: false,
          selectedModel: "gpt-test",
          detail: { internal: "sensitive" }
        })
      } as any
    );

    const out = await controller.getInferenceHealth({ user: { role: "admin" } } as any);
    expect(out.ok).toBe(true);
    expect(out.workerDetail).toBeNull();
  });
});
