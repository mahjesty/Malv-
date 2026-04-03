import { ObservabilityService } from "../common/observability.service";
import { ConfigService } from "@nestjs/config";

describe("MALV infra & scaling hooks", () => {
  it("records HTTP latency without throwing", () => {
    const obs = new ObservabilityService({ get: () => "false" } as unknown as ConfigService);
    expect(() =>
      obs.observeHttpRequest({ method: "GET", path: "/v1/admin/system/health", statusCode: 200, durationMs: 12 })
    ).not.toThrow();
  });

  it("records job execution counters", () => {
    const obs = new ObservabilityService({ get: () => "false" } as unknown as ConfigService);
    expect(() => {
      obs.recordJobExecution("multimodal_deep_extract", "retry_scheduled");
      obs.recordJobExecution("beast_proactive", "completed");
    }).not.toThrow();
  });

  it("records sandbox run histogram", () => {
    const obs = new ObservabilityService({ get: () => "false" } as unknown as ConfigService);
    expect(() => obs.observeSandboxRun("file_understand_extract", "completed", 1500)).not.toThrow();
  });
});
