import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { getRepositoryToken } from "@nestjs/typeorm";
import { InferenceBackendSettingsEntity } from "../db/entities/inference-backend-settings.entity";
import { InferenceConfigService } from "./inference-config.service";

function sampleDbRow(overrides: Partial<InferenceBackendSettingsEntity> = {}): InferenceBackendSettingsEntity {
  const now = new Date();
  return {
    id: "00000000-0000-0000-0000-000000000001",
    enabled: true,
    backendType: "openai_compatible",
    baseUrl: "https://db-pod.example/v1",
    apiKey: "db-key",
    model: "db-model",
    timeoutMs: null,
    fallbackEnabled: true,
    fallbackBackend: "fallback",
    fallbackPolicy: "allow_on_error",
    lastUpdatedByUserId: "u1",
    createdAt: now,
    updatedAt: now,
    ...overrides
  } as InferenceBackendSettingsEntity;
}

describe("InferenceConfigService", () => {
  let svc: InferenceConfigService;
  let cfg: Record<string, string>;
  const findMock = jest.fn();

  beforeEach(async () => {
    jest.resetAllMocks();
    cfg = {
      NODE_ENV: "development",
      MALV_INFERENCE_PROVIDER: "openai_compatible",
      MALV_INFERENCE_BASE_URL: "https://one.example/v1",
      MALV_INFERENCE_MODEL: "m",
      MALV_INFERENCE_API_KEY: "secret-one",
      INFERENCE_FALLBACK_ENABLED: "true"
    };
    findMock.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InferenceConfigService,
        { provide: ConfigService, useValue: { get: (k: string) => cfg[k] } },
        {
          provide: getRepositoryToken(InferenceBackendSettingsEntity),
          useValue: { find: findMock }
        }
      ]
    }).compile();
    svc = module.get(InferenceConfigService);
  });

  it("bumps env configRevision when only the primary base URL changes (worker refresh signal)", async () => {
    const r1 = await svc.getEffectiveConfigForWorker();
    cfg["MALV_INFERENCE_BASE_URL"] = "https://two.example/v1";
    const r2 = await svc.getEffectiveConfigForWorker();
    expect(r1.configRevision).not.toEqual(r2.configRevision);
    expect(r1.configRevision.startsWith("env:v3:")).toBe(true);
    expect(r2.configRevision.startsWith("env:v3:")).toBe(true);
    expect(r2.effective.baseUrl).toContain("two.example");
  });

  it("bumps env configRevision when only the API key changes", async () => {
    const r1 = await svc.getEffectiveConfigForWorker();
    cfg["MALV_INFERENCE_API_KEY"] = "secret-two";
    const r2 = await svc.getEffectiveConfigForWorker();
    expect(r1.configRevision).not.toEqual(r2.configRevision);
  });

  it("db_compat: enabled valid DB row wins over env", async () => {
    findMock.mockResolvedValue([sampleDbRow()]);
    const r = await svc.getEffectiveConfigForWorker();
    expect(r.primaryAuthority).toBe("db_compat");
    expect(r.configSource).toBe("db_override");
    expect(r.effective.baseUrl).toContain("db-pod.example");
    expect(r.effective.model).toBe("db-model");
  });

  it("env authority: uses env effective config and surfaces inactive DB override", async () => {
    cfg["MALV_INFERENCE_PRIMARY_AUTHORITY"] = "env";
    findMock.mockResolvedValue([sampleDbRow()]);
    const r = await svc.getEffectiveConfigForWorker();
    expect(r.primaryAuthority).toBe("env");
    expect(r.configSource).toBe("env");
    expect(r.effective.baseUrl).toContain("one.example");
    expect(r.dbOverridePresentButInactive).toBe(true);
  });

  it("getPrimaryAuthority defaults to db_compat when unset", () => {
    expect(svc.getPrimaryAuthority()).toBe("db_compat");
  });

  it("getPrimaryAuthority reads env", async () => {
    cfg["MALV_INFERENCE_PRIMARY_AUTHORITY"] = "env";
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InferenceConfigService,
        { provide: ConfigService, useValue: { get: (k: string) => cfg[k] } },
        {
          provide: getRepositoryToken(InferenceBackendSettingsEntity),
          useValue: { find: findMock }
        }
      ]
    }).compile();
    const s2 = module.get(InferenceConfigService);
    expect(s2.getPrimaryAuthority()).toBe("env");
  });
});
