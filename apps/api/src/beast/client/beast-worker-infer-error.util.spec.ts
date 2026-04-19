import { formatBeastWorkerInferFailureMessage } from "./beast-worker-infer-error.util";

describe("formatBeastWorkerInferFailureMessage", () => {
  it("adds routing hint for OpenAI-shaped 404 on /v1/infer", () => {
    const body = JSON.stringify({
      error: { message: "File Not Found", type: "not_found_error", code: 404 }
    });
    const out = formatBeastWorkerInferFailureMessage(404, body, "http://127.0.0.1:8081/v1/infer");
    expect(out).toMatch(/not_found_error/);
    expect(out).toMatch(/BEAST_WORKER_BASE_URL/);
    expect(out).toMatch(/\/v1\/infer/);
  });

  it("returns body-only for non-404", () => {
    expect(formatBeastWorkerInferFailureMessage(500, "boom", "http://h/v1/infer")).toBe("boom");
  });

  it("returns status-only for empty 404 body", () => {
    expect(formatBeastWorkerInferFailureMessage(404, "", "http://h/v1/infer")).toMatch(/HTTP 404/);
  });
});
