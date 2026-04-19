import { Repository } from "typeorm";
import { BuildUnitEntity } from "../db/entities/build-unit.entity";
import {
  parseExploreHandoffJson,
  resolveExploreContextForMalv,
  resolveExploreContextForMalvWithResolution
} from "./explore-handoff-prompt.util";

describe("explore-handoff-prompt.util", () => {
  it("parseExploreHandoffJson rejects oversize and invalid", () => {
    expect(parseExploreHandoffJson(null)).toBeNull();
    expect(parseExploreHandoffJson("")).toBeNull();
    expect(parseExploreHandoffJson("{}")).toBeNull();
    expect(parseExploreHandoffJson("x".repeat(25_000))).toBeNull();
  });

  it("parseExploreHandoffJson accepts v1 minimal and normalizes to v2 shape", () => {
    const j = JSON.stringify({
      v: 1,
      sourceSurface: "explore",
      unitId: "u1",
      unitSessionId: "sess"
    });
    const p = parseExploreHandoffJson(j);
    expect(p?.unitId).toBe("u1");
    expect(p?.v).toBe(2);
    expect(p?.previewContext?.mode).toBeDefined();
  });

  it("resolveExploreContextForMalv emits operator signals without raw unit ids in copy", async () => {
    const mockRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: "u1",
        title: "Hello",
        visibility: "public",
        authorUserId: null,
        archivedAt: null
      })
    } as unknown as Repository<BuildUnitEntity>;

    const parsed = parseExploreHandoffJson(
      JSON.stringify({
        v: 2,
        sourceSurface: "explore",
        unitId: "u1",
        unitSessionId: "sess",
        sourceSubsurface: "detail",
        actionType: "ask_malv",
        previewContext: { mode: "live", confidence: "high" },
        reviewContext: { decision: "", previewAllowed: false, publishAllowed: false },
        presentationContext: { viewport: "mobile", compareMode: false, fullscreen: false },
        continuityContext: {
          returnSurface: "explore_detail",
          restoreUnitId: "u1",
          restoreViewport: "mobile",
          restoreCompareMode: false
        }
      })
    )!;
    const sigs = await resolveExploreContextForMalv({
      userId: "user-1",
      parsed,
      units: mockRepo
    });
    expect(sigs.length).toBeGreaterThan(0);
    const joined = sigs.map((s) => s.text).join("\n");
    expect(joined).toContain("Hello");
    expect(joined).toContain("Explore continuity");
    expect(joined).not.toMatch(/\bu1\b/);
    expect(joined).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });

  it("resolveExploreContextForMalvWithResolution returns resolution and unitHints when ok", async () => {
    const mockRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: "u1",
        title: "Hello",
        visibility: "public",
        authorUserId: null,
        archivedAt: null,
        previewKind: "rendered",
        category: "web",
        tags: null,
        metadataJson: null,
        intakePreviewState: null
      })
    } as unknown as Repository<BuildUnitEntity>;

    const parsed = parseExploreHandoffJson(
      JSON.stringify({
        v: 2,
        sourceSurface: "explore",
        unitId: "u1",
        unitSessionId: "sess",
        sourceSubsurface: "detail",
        actionType: "ask_malv",
        previewContext: { mode: "live", confidence: "high" },
        reviewContext: { decision: "", previewAllowed: false, publishAllowed: false },
        presentationContext: { viewport: "mobile", compareMode: false, fullscreen: false },
        continuityContext: {
          returnSurface: "explore_detail",
          restoreUnitId: "u1",
          restoreViewport: "mobile",
          restoreCompareMode: false
        }
      })
    )!;
    const r = await resolveExploreContextForMalvWithResolution({
      userId: "user-1",
      parsed,
      units: mockRepo
    });
    expect(r.resolution).toBe("ok");
    expect(r.unitHints?.title).toBe("Hello");
    expect(r.signals.length).toBeGreaterThan(0);
  });
});
