import {
  isCciStrictPlanCoherenceEnabled,
  pathsLooselyMatch,
  shouldBlockStrictPlanExecution,
  validateExecutionMatchesPlan
} from "./plan-execution-coherence";

describe("plan-execution-coherence", () => {
  it("isCciStrictPlanCoherenceEnabled reads MALV_CCI_STRICT_PLAN_COHERENCE", () => {
    const prev = process.env.MALV_CCI_STRICT_PLAN_COHERENCE;
    process.env.MALV_CCI_STRICT_PLAN_COHERENCE = "1";
    expect(isCciStrictPlanCoherenceEnabled()).toBe(true);
    process.env.MALV_CCI_STRICT_PLAN_COHERENCE = "";
    expect(isCciStrictPlanCoherenceEnabled()).toBe(false);
    process.env.MALV_CCI_STRICT_PLAN_COHERENCE = prev;
  });

  it("pathsLooselyMatch accepts exact and suffix-aligned paths", () => {
    expect(pathsLooselyMatch("apps/api/src/foo.ts", "apps/api/src/foo.ts")).toBe(true);
    expect(pathsLooselyMatch("apps/api/src/foo.ts", "src/foo.ts")).toBe(true);
    expect(pathsLooselyMatch("foo.ts", "bar/foo.ts")).toBe(true);
    expect(pathsLooselyMatch("a.ts", "b.ts")).toBe(false);
  });

  it("empty filesChanged vs non-empty plan targets yields none alignment and warnings", () => {
    const c = validateExecutionMatchesPlan({
      filesChanged: [],
      filesToModify: ["apps/api/src/a.ts"],
      filesToCreate: []
    });
    expect(c.alignment).toBe("none");
    expect(c.codes).toContain("cci_plan_execution_empty_vs_planned_targets");
    expect(c.warnings.length).toBeGreaterThan(0);
    expect(shouldBlockStrictPlanExecution(c)).toBe(true);
  });

  it("no overlap between submitted and planned yields none", () => {
    const c = validateExecutionMatchesPlan({
      filesChanged: ["apps/web/src/x.tsx"],
      filesToModify: ["apps/api/src/a.ts"],
      filesToCreate: []
    });
    expect(c.alignment).toBe("none");
    expect(c.codes).toContain("cci_plan_execution_no_overlap");
    expect(shouldBlockStrictPlanExecution(c)).toBe(true);
  });

  it("full alignment when submitted matches all planned and no extras", () => {
    const c = validateExecutionMatchesPlan({
      filesChanged: ["apps/api/src/a.ts"],
      filesToModify: ["apps/api/src/a.ts"],
      filesToCreate: []
    });
    expect(c.alignment).toBe("full");
    expect(c.warnings).toHaveLength(0);
    expect(shouldBlockStrictPlanExecution(c)).toBe(false);
  });

  it("partial alignment when some planned files missing or extra submitted", () => {
    const c = validateExecutionMatchesPlan({
      filesChanged: ["apps/api/src/a.ts"],
      filesToModify: ["apps/api/src/a.ts", "apps/api/src/b.ts"],
      filesToCreate: []
    });
    expect(c.alignment).toBe("partial");
    expect(c.codes.length).toBeGreaterThan(0);
    expect(shouldBlockStrictPlanExecution(c)).toBe(false);
  });

  it("unknown alignment when plan lists no file targets", () => {
    const c = validateExecutionMatchesPlan({
      filesChanged: ["apps/api/src/a.ts"],
      filesToModify: [],
      filesToCreate: []
    });
    expect(c.alignment).toBe("unknown");
    expect(shouldBlockStrictPlanExecution(c)).toBe(false);
  });

  it("strict does not block partial overlap", () => {
    const c = validateExecutionMatchesPlan({
      filesChanged: ["apps/api/src/a.ts", "extra.ts"],
      filesToModify: ["apps/api/src/a.ts", "apps/api/src/b.ts"],
      filesToCreate: []
    });
    expect(c.alignment).toBe("partial");
    expect(shouldBlockStrictPlanExecution(c)).toBe(false);
  });
});
