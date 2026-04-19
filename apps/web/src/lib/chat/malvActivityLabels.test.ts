import { describe, expect, it } from "vitest";
import { malvActivityLabel } from "./malvActivityLabels";

describe("malvActivityLabel", () => {
  it("maps super_fix_execute", () => {
    expect(malvActivityLabel("super_fix_execute")).toBe("Refining the answer");
  });

  it("maps known server_phase suffixes", () => {
    expect(malvActivityLabel("server_phase:plan")).toBe("Planning the approach");
    expect(malvActivityLabel("server_phase:audit")).toBe("Reviewing constraints");
  });

  it("falls back for unknown server_phase suffix", () => {
    expect(malvActivityLabel("server_phase:unknown_step")).toBe("Working on your request");
  });
});
