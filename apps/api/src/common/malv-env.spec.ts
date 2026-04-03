import { brainHealthFallbackEnabled, malvFallbackEnabledFromEnv } from "./malv-env";

describe("malvFallbackEnabledFromEnv", () => {
  it("defaults true when unset or empty (matches beast-worker)", () => {
    expect(malvFallbackEnabledFromEnv(undefined)).toBe(true);
    expect(malvFallbackEnabledFromEnv("")).toBe(true);
  });

  it("parses truthy tokens case-insensitively", () => {
    expect(malvFallbackEnabledFromEnv("true")).toBe(true);
    expect(malvFallbackEnabledFromEnv("TRUE")).toBe(true);
    expect(malvFallbackEnabledFromEnv("1")).toBe(true);
    expect(malvFallbackEnabledFromEnv("yes")).toBe(true);
    expect(malvFallbackEnabledFromEnv("on")).toBe(true);
  });

  it("treats explicit false and other strings as disabled", () => {
    expect(malvFallbackEnabledFromEnv("false")).toBe(false);
    expect(malvFallbackEnabledFromEnv("0")).toBe(false);
    expect(malvFallbackEnabledFromEnv("off")).toBe(false);
    expect(malvFallbackEnabledFromEnv("no")).toBe(false);
  });
});

describe("brainHealthFallbackEnabled", () => {
  it("is false when API env disables fallback even if worker would allow", () => {
    expect(
      brainHealthFallbackEnabled({
        malvFallbackEnabledEnv: "false",
        workerFallbackEnabled: true
      })
    ).toBe(false);
  });

  it("is false when worker reports fallback disabled even if API env is unset (default on)", () => {
    expect(
      brainHealthFallbackEnabled({
        malvFallbackEnabledEnv: undefined,
        workerFallbackEnabled: false
      })
    ).toBe(false);
  });

  it("is true only when both API and worker allow", () => {
    expect(
      brainHealthFallbackEnabled({
        malvFallbackEnabledEnv: "true",
        workerFallbackEnabled: true
      })
    ).toBe(true);
    expect(
      brainHealthFallbackEnabled({
        malvFallbackEnabledEnv: undefined,
        workerFallbackEnabled: true
      })
    ).toBe(true);
  });
});
