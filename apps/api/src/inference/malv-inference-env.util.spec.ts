import { malvEnvFirst, MALV_LOCAL_CPU_INFERENCE_ENV, MALV_PRIMARY_INFERENCE_ENV } from "./malv-inference-env.util";

describe("malvEnvFirst", () => {
  it("returns first non-empty value", () => {
    const get = (k: string) =>
      ({ A: "  ", B: "x", C: "y" } as Record<string, string | undefined>)[k];
    expect(malvEnvFirst(get, ["A", "B", "C"] as const)).toBe("x");
  });

  it("returns undefined when all empty", () => {
    expect(malvEnvFirst(() => undefined, MALV_PRIMARY_INFERENCE_ENV.PROVIDER)).toBeUndefined();
  });
});

describe("MALV_PRIMARY_INFERENCE_ENV precedence", () => {
  it("prefers MALV_INFERENCE_MODEL over INFERENCE_MODEL", () => {
    const get = (k: string) =>
      ({
        MALV_INFERENCE_MODEL: "malv-model",
        INFERENCE_MODEL: "legacy-model"
      })[k];
    expect(malvEnvFirst(get, MALV_PRIMARY_INFERENCE_ENV.MODEL)).toBe("malv-model");
  });
});

describe("MALV_LOCAL_CPU_INFERENCE_ENV precedence", () => {
  it("prefers MALV_LOCAL_CPU_INFERENCE_ENABLED over legacy", () => {
    const get = (k: string) =>
      ({
        MALV_LOCAL_CPU_INFERENCE_ENABLED: "false",
        MALV_LOCAL_INFERENCE_ENABLED: "true"
      })[k];
    expect(malvEnvFirst(get, MALV_LOCAL_CPU_INFERENCE_ENV.ENABLED)).toBe("false");
  });
});
