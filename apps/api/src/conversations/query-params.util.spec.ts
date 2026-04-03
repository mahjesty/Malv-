import { clampInt } from "./query-params.util";

describe("clampInt", () => {
  it("uses fallback when input is NaN", () => {
    expect(clampInt(Number("x"), 30, 1, 100)).toBe(30);
  });

  it("clamps to bounds", () => {
    expect(clampInt(500, 30, 1, 100)).toBe(100);
    expect(clampInt(-1, 0, 0, 10)).toBe(0);
  });
});
