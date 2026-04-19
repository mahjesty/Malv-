import { describe, expect, it } from "vitest";
import { buildAssistantPresentationFenceSegments } from "./malv-assistant-text-present";

describe("buildAssistantPresentationFenceSegments", () => {
  it("uses same structural interpretation for live and settled when no rich strip targets", () => {
    const input = "###Title\n- item\n```\nconst x = 1\n```\nDone **";
    const live = buildAssistantPresentationFenceSegments(input, { phase: "live" });
    const settled = buildAssistantPresentationFenceSegments(input, { phase: "settled" });
    expect(live).toEqual(settled);
  });

  it("applies rich-surface strip only in settled phase", () => {
    const input = "See https://a.com/x for more.";
    const live = buildAssistantPresentationFenceSegments(input, {
      phase: "live",
      richSurfaceStrip: { sourceUrls: ["https://a.com/x"], imageUrls: [] }
    });
    const settled = buildAssistantPresentationFenceSegments(input, {
      phase: "settled",
      richSurfaceStrip: { sourceUrls: ["https://a.com/x"], imageUrls: [] }
    });
    expect(live[0]).toEqual({ kind: "prose", text: "See https://a.com/x for more." });
    expect(settled[0]).toEqual({ kind: "prose", text: "See for more." });
  });

  it("sanitizes trailing unmatched bold marker in both phases", () => {
    const input = "Hello **";
    const live = buildAssistantPresentationFenceSegments(input, { phase: "live" });
    const settled = buildAssistantPresentationFenceSegments(input, { phase: "settled" });
    expect(live).toEqual([{ kind: "prose", text: "Hello " }]);
    expect(settled).toEqual([{ kind: "prose", text: "Hello " }]);
  });

  it("softens live trailing marker-only line fragments without changing settled text", () => {
    const input = "Steps:\n- ";
    const live = buildAssistantPresentationFenceSegments(input, { phase: "live" });
    const settled = buildAssistantPresentationFenceSegments(input, { phase: "settled" });
    expect(live).toEqual([{ kind: "prose", text: "Steps:\n" }]);
    expect(settled).toEqual([{ kind: "prose", text: "Steps:\n- " }]);
  });

  it("keeps code fence segments stable while polishing prose", () => {
    const input = "Intro\n```\nconst x = 1\n```\n#";
    const live = buildAssistantPresentationFenceSegments(input, { phase: "live" });
    expect(live).toEqual([
      { kind: "prose", text: "Intro\n" },
      { kind: "code", text: "\nconst x = 1\n" },
      { kind: "prose", text: "\n" }
    ]);
  });
});
