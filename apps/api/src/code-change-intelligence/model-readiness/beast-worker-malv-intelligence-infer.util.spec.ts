import { parseJsonObject, stripJsonFence } from "./beast-worker-malv-intelligence-infer.util";

describe("beast-worker-malv-intelligence-infer.util", () => {
  it("stripJsonFence removes markdown fences", () => {
    expect(stripJsonFence("```json\n{\"a\":1}\n```")).toBe("{\"a\":1}");
  });

  it("parseJsonObject returns object or null", () => {
    expect(parseJsonObject('{"x":true}')).toEqual({ x: true });
    expect(parseJsonObject("not json")).toBeNull();
    expect(parseJsonObject("[]")).toBeNull();
  });
});
