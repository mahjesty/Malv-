import { describe, expect, it } from "vitest";
import { formatUnreachableApiMessage, mapFetchFailure, parseNestErrorMessage } from "./http-core";

describe("parseNestErrorMessage", () => {
  it("prefers Nest message over generic error field (400 bodies)", () => {
    const body = JSON.stringify({
      statusCode: 400,
      message: "fileKind must be one of: pdf, image, audio, video, doc, text",
      error: "Bad Request"
    });
    expect(parseNestErrorMessage(new Error(body))).toBe(
      "fileKind must be one of: pdf, image, audio, video, doc, text"
    );
  });

  it("joins validation message arrays", () => {
    const body = JSON.stringify({
      statusCode: 400,
      message: ["workspaceId must be a UUID", "roomId must be a UUID"],
      error: "Bad Request"
    });
    expect(parseNestErrorMessage(new Error(body))).toBe("workspaceId must be a UUID, roomId must be a UUID");
  });

  it("falls back to error when message is absent", () => {
    const body = JSON.stringify({ statusCode: 401, error: "Unauthorized" });
    expect(parseNestErrorMessage(new Error(body))).toBe("Unauthorized");
  });
});

describe("mapFetchFailure", () => {
  it("maps TypeError to an actionable MALV message with base URL", () => {
    const err = mapFetchFailure(new TypeError("Failed to fetch"));
    expect(err.message).toContain("MALV");
    expect(err.message).toContain("localhost:8080");
    expect(err.message).toContain("npm run dev:api");
  });

  it("matches formatUnreachableApiMessage for TypeError", () => {
    expect(mapFetchFailure(new TypeError("Failed to fetch")).message).toBe(formatUnreachableApiMessage());
  });

  it("does not remap AbortError to offline", () => {
    const aborted =
      typeof DOMException !== "undefined"
        ? new DOMException("The user aborted a request.", "AbortError")
        : Object.assign(new Error("The user aborted a request."), { name: "AbortError" });
    const out = mapFetchFailure(aborted);
    expect(out).toBe(aborted);
  });
});
