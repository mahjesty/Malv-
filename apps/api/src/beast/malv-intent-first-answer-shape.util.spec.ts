import {
  buildMalvIntentFirstAnswerShapePromptSection,
  classifyMalvQuestionAnswerShape
} from "./malv-intent-first-answer-shape.util";

describe("classifyMalvQuestionAnswerShape", () => {
  it("classifies short auxiliary-led questions as yes_no", () => {
    expect(classifyMalvQuestionAnswerShape("is delta state clean")).toBe("yes_no");
    expect(classifyMalvQuestionAnswerShape("Does this API require auth?")).toBe("yes_no");
  });

  it("uses the strongest question line on multi-line messages", () => {
    expect(
      classifyMalvQuestionAnswerShape("Thanks — quick follow-up.\n\nis delta state clean?\n")
    ).toBe("yes_no");
  });

  it("classifies lookup-style openers as factual", () => {
    expect(classifyMalvQuestionAnswerShape("what is the capital of Ghana")).toBe("factual");
    expect(classifyMalvQuestionAnswerShape("who wrote Frankenstein")).toBe("factual");
  });

  it("classifies mechanism / why questions as exploratory", () => {
    expect(classifyMalvQuestionAnswerShape("why does the moon have phases")).toBe("exploratory");
    expect(classifyMalvQuestionAnswerShape("how does a heat pump work")).toBe("exploratory");
  });

  it("classifies heavy compare/analyze asks as deep_analysis", () => {
    expect(classifyMalvQuestionAnswerShape("compare Postgres and MySQL for OLTP")).toBe("deep_analysis");
    expect(classifyMalvQuestionAnswerShape(`${"x".repeat(400)} and implications?`)).toBe("deep_analysis");
  });
});

describe("buildMalvIntentFirstAnswerShapePromptSection", () => {
  it("includes the shape label and anti-tutorial lines", () => {
    const s = buildMalvIntentFirstAnswerShapePromptSection("factual");
    expect(s).toContain("factual");
    expect(s).toContain("you can search");
    expect(s).toContain("Images / media");
  });
});
