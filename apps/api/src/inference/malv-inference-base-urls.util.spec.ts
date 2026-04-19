import {
  assertBeastWorkerBaseDistinctFromLocalModelOrThrow,
  MALV_BEAST_WORKER_DEFAULT_BASE_URL,
  resolveBeastWorkerBaseUrl,
  resolveMalvLocalInferenceBaseUrl,
  validateMalvInferenceBaseUrlsFromProcessEnv
} from "./malv-inference-base-urls.util";
import { MALV_LOCAL_LLAMA_SERVER_DEFAULT_BASE_URL } from "./local-inference.constants";

describe("malv-inference-base-urls.util", () => {
  it("defaults BEAST_WORKER to :9090 and local inference to :8081 with no cross-fallback", () => {
    const get = (_k: string) => undefined;
    expect(resolveBeastWorkerBaseUrl(get)).toBe(MALV_BEAST_WORKER_DEFAULT_BASE_URL);
    expect(resolveMalvLocalInferenceBaseUrl(get)).toBe(MALV_LOCAL_LLAMA_SERVER_DEFAULT_BASE_URL);
  });

  it("resolves worker URL only from BEAST_WORKER_BASE_URL", () => {
    const get = (k: string) =>
      k === "MALV_LOCAL_INFERENCE_BASE_URL" ? "http://127.0.0.1:7777" : k === "BEAST_WORKER_BASE_URL" ? "" : undefined;
    expect(resolveBeastWorkerBaseUrl(get)).toBe(MALV_BEAST_WORKER_DEFAULT_BASE_URL);
  });

  it("resolves local inference URL only from MALV_LOCAL_INFERENCE_BASE_URL", () => {
    const get = (k: string) =>
      k === "BEAST_WORKER_BASE_URL" ? "http://127.0.0.1:9090" : k === "MALV_LOCAL_INFERENCE_BASE_URL" ? "" : undefined;
    expect(resolveMalvLocalInferenceBaseUrl(get)).toBe(MALV_LOCAL_LLAMA_SERVER_DEFAULT_BASE_URL);
  });

  it("prefers MALV_LOCAL_CPU_INFERENCE_BASE_URL over legacy", () => {
    const get = (k: string) =>
      k === "MALV_LOCAL_CPU_INFERENCE_BASE_URL"
        ? "http://127.0.0.1:7777"
        : k === "MALV_LOCAL_INFERENCE_BASE_URL"
          ? "http://127.0.0.1:8081"
          : undefined;
    expect(resolveMalvLocalInferenceBaseUrl(get)).toBe("http://127.0.0.1:7777");
  });

  it("validateMalvInferenceBaseUrlsFromProcessEnv throws when worker is mispointed to llama port 8081 with default local", () => {
    expect(() =>
      validateMalvInferenceBaseUrlsFromProcessEnv({
        BEAST_WORKER_BASE_URL: "http://127.0.0.1:8081"
      } as NodeJS.ProcessEnv)
    ).toThrow(/BEAST_WORKER_BASE_URL/);
  });

  it("validateMalvInferenceBaseUrlsFromProcessEnv throws when both env vars are explicitly equal", () => {
    expect(() =>
      validateMalvInferenceBaseUrlsFromProcessEnv({
        BEAST_WORKER_BASE_URL: "http://localhost:8081/",
        MALV_LOCAL_INFERENCE_BASE_URL: "http://localhost:8081"
      } as NodeJS.ProcessEnv)
    ).toThrow(/MALV inference config/);
  });

  it("validateMalvInferenceBaseUrlsFromProcessEnv passes for canonical dev split", () => {
    expect(() =>
      validateMalvInferenceBaseUrlsFromProcessEnv({
        BEAST_WORKER_BASE_URL: "http://127.0.0.1:9090",
        MALV_LOCAL_INFERENCE_BASE_URL: "http://127.0.0.1:8081"
      } as NodeJS.ProcessEnv)
    ).not.toThrow();
  });

  it("assertBeastWorkerBaseDistinctFromLocalModelOrThrow matches startup guard", () => {
    const get = (_k: string) => undefined;
    expect(() =>
      assertBeastWorkerBaseDistinctFromLocalModelOrThrow(MALV_LOCAL_LLAMA_SERVER_DEFAULT_BASE_URL, get)
    ).toThrow(/must differ/);
  });
});
