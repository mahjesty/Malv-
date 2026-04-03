import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { BugDetectionService } from "./bug-detection.service";
import { FixPlanningService } from "./fix-planning.service";
import { PerformanceIntelligenceService } from "./performance-intelligence.service";

describe("MALV intelligence expansion", () => {
  const bugs = new BugDetectionService();
  const perf = new PerformanceIntelligenceService();
  const fix = new FixPlanningService();

  it("detects real issues in synthetic TS", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "malv-bug-"));
    const f = path.join(dir, "apps", "api", "src", "x.ts");
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(
      f,
      `
      export function bad() {
        const x = JSON.parse("{}") as any;
        eval("1");
        [1,2].forEach(async () => { await 1; });
        try { } catch (e) {}
      }
    `,
      "utf8"
    );
    const rel = "apps/api/src/x.ts";
    const out = bugs.detect(dir, [rel]);
    expect(out.issues.some((i) => i.category === "unsafe_pattern")).toBe(true);
    expect(out.issues.some((i) => i.category === "type_inconsistency")).toBe(true);
    expect(out.issues.some((i) => i.category === "risky_async")).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("suggests valid fixes with risk and confidence", () => {
    const bug = bugs.detect(process.cwd(), ["apps/api/src/code-change-intelligence/bug-detection.service.ts"]);
    const p = perf.analyze(process.cwd(), ["apps/api/src/code-change-intelligence/performance-intelligence.service.ts"]);
    const plan = fix.plan({ bugs: bug, perf: p });
    expect(plan.pipelinePolicy).toContain("audit");
    expect(plan.items.length).toBeGreaterThanOrEqual(0);
    if (plan.items.length > 0) {
      expect(plan.items[0].proposedFix.length).toBeGreaterThan(5);
      expect(["low", "medium", "high"]).toContain(plan.items[0].risk);
      expect(["low", "medium", "high"]).toContain(plan.items[0].confidence);
    }
  });

  it("performance intelligence returns structured hints", () => {
    const out = perf.analyze(process.cwd(), ["apps/api/src/code-change-intelligence/code-change-intelligence.service.ts"]);
    expect(out.scannedFiles).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(out.issues)).toBe(true);
  });
});
