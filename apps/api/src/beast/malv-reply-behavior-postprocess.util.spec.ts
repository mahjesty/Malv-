import { stripMalvImagePresenceMetaCommentary, stripMalvTutorialGuidancePhrasing } from "./malv-reply-behavior-postprocess.util";

describe("stripMalvTutorialGuidancePhrasing", () => {
  it("removes search-engine coaching phrases", () => {
    const raw =
      "Delta State has mixed cleanliness.\n\nYou can search for local waste reports to find images of problem areas.";
    const out = stripMalvTutorialGuidancePhrasing(raw);
    expect(out.toLowerCase()).not.toContain("you can search");
    expect(out).toMatch(/Delta State/i);
  });

  it("removes 'steps to find' style discovery steps", () => {
    const raw = "Overview.\n\nSteps to find official statistics: open a browser.";
    const out = stripMalvTutorialGuidancePhrasing(raw);
    expect(out.toLowerCase()).not.toContain("steps to find");
    expect(out).toContain("Overview");
  });
});

describe("stripMalvImagePresenceMetaCommentary", () => {
  it("drops lines that only apologize for missing images", () => {
    const raw = "Rainfall varies by season.\n\nI couldn't find any images for this topic.";
    const out = stripMalvImagePresenceMetaCommentary(raw);
    expect(out.toLowerCase()).not.toContain("couldn't find");
    expect(out).toMatch(/Rainfall/i);
  });
});
