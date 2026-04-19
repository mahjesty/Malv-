import { inferDefaultPublishedBuildUnitTypeFromOriginalName } from "./source-intake-publish-type.util";

describe("inferDefaultPublishedBuildUnitTypeFromOriginalName", () => {
  it("maps frontend extensions to component or template", () => {
    expect(inferDefaultPublishedBuildUnitTypeFromOriginalName("frontend-utils.ts")).toBe("component");
    expect(inferDefaultPublishedBuildUnitTypeFromOriginalName("frontend-component.tsx")).toBe("component");
    expect(inferDefaultPublishedBuildUnitTypeFromOriginalName("path/frontend-next-page.tsx")).toBe("component");
    expect(inferDefaultPublishedBuildUnitTypeFromOriginalName("single-file-preview-test.html")).toBe("template");
  });

  it("maps yaml and json", () => {
    expect(inferDefaultPublishedBuildUnitTypeFromOriginalName("ci.yaml")).toBe("workflow");
    expect(inferDefaultPublishedBuildUnitTypeFromOriginalName("cfg.json")).toBe("blueprint");
  });

  it("never returns ai_generated", () => {
    expect(inferDefaultPublishedBuildUnitTypeFromOriginalName("mystery.xyz")).toBe("component");
    expect(inferDefaultPublishedBuildUnitTypeFromOriginalName(null)).toBe("component");
  });
});
