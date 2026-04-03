import { CciAutoDebugLoopService } from "./cci-auto-debug-loop.service";

describe("CciAutoDebugLoopService", () => {
  const service = new CciAutoDebugLoopService();

  afterEach(() => {
    delete process.env.MALV_CCI_AUTO_DEBUG_LOOP;
    delete process.env.MALV_CCI_AUTO_DEBUG_LOOP_MAX_ATTEMPTS;
  });

  const evidenceFailedTypecheck = {
    typecheck: { status: "failed", command: "tsc --noEmit", exitCode: 2, summary: "Type error" },
    lint: { status: "passed", command: "eslint .", exitCode: 0, summary: "OK" },
    tests: { status: "passed", command: "jest", exitCode: 0, summary: "OK" }
  } as const;

  const evidencePassed = {
    typecheck: { status: "passed", command: "tsc --noEmit", exitCode: 0, summary: "OK" },
    lint: { status: "passed", command: "eslint .", exitCode: 0, summary: "OK" },
    tests: { status: "passed", command: "jest", exitCode: 0, summary: "OK" }
  } as const;

  it("disabled by default", () => {
    expect(service.isEnabled()).toBe(false);
  });

  it("feature enabled with env allows failed typecheck retry", () => {
    process.env.MALV_CCI_AUTO_DEBUG_LOOP = "true";
    const out = service.shouldAttemptRetry({
      evidence: evidenceFailedTypecheck,
      plan: { filesToModify: ["a.ts"], filesToCreate: [] } as any,
      audit: null,
      trustLevel: "controlled",
      planExecutionCoherence: { alignment: "full" } as any,
      filesChanged: ["a.ts"],
      attempt: 0
    });
    expect(out.allowed).toBe(true);
    expect(out.category).toBe("typecheck_failure");
    expect(out.fixStrategy.strategyType).toBe("type_fix");
  });

  it("blocks when validation evidence indicates not_run", () => {
    process.env.MALV_CCI_AUTO_DEBUG_LOOP = "true";
    const out = service.shouldAttemptRetry({
      evidence: {
        typecheck: { status: "not_run", command: "tsc", exitCode: null, summary: "n/a" }
      },
      plan: { filesToModify: ["a.ts"], filesToCreate: [] } as any,
      audit: null,
      trustLevel: "controlled",
      planExecutionCoherence: { alignment: "full" } as any,
      filesChanged: ["a.ts"],
      attempt: 0
    });
    expect(out.allowed).toBe(false);
    expect(out.reason).toBe("validation_not_run");
  });

  it("blocks when validation already passed", () => {
    process.env.MALV_CCI_AUTO_DEBUG_LOOP = "true";
    const out = service.shouldAttemptRetry({
      evidence: evidencePassed,
      plan: { filesToModify: ["a.ts"], filesToCreate: [] } as any,
      audit: null,
      trustLevel: "controlled",
      planExecutionCoherence: { alignment: "full" } as any,
      filesChanged: ["a.ts"],
      attempt: 0
    });
    expect(out.allowed).toBe(false);
    expect(out.reason).toBe("validation_passed");
  });

  it("stops at max attempts", () => {
    process.env.MALV_CCI_AUTO_DEBUG_LOOP = "true";
    process.env.MALV_CCI_AUTO_DEBUG_LOOP_MAX_ATTEMPTS = "1";
    const out = service.shouldAttemptRetry({
      evidence: evidenceFailedTypecheck,
      plan: { filesToModify: ["a.ts"], filesToCreate: [] } as any,
      audit: null,
      trustLevel: "controlled",
      planExecutionCoherence: { alignment: "full" } as any,
      filesChanged: ["a.ts"],
      attempt: 1
    });
    expect(out.allowed).toBe(false);
    expect(out.reason).toBe("max_attempts_reached");
  });

  it("no improvement detection catches repeated same failure", () => {
    expect(service.isImproved(evidenceFailedTypecheck, evidenceFailedTypecheck)).toBe(false);
  });

  it("scope includes changed files and planned files", () => {
    const scope = service.computeAllowedScope({
      plan: { filesToModify: ["a.ts"], filesToCreate: ["b.ts"] } as any,
      filesChanged: ["c.ts", "a.ts"]
    });
    expect(scope).toEqual(["c.ts", "a.ts", "b.ts"]);
  });

  it("blocks security-sensitive retries", () => {
    process.env.MALV_CCI_AUTO_DEBUG_LOOP = "true";
    const out = service.shouldAttemptRetry({
      evidence: evidenceFailedTypecheck,
      plan: { filesToModify: ["a.ts"], filesToCreate: [] } as any,
      audit: { scopeClassification: { securitySensitive: true } } as any,
      trustLevel: "critical",
      planExecutionCoherence: { alignment: "full" } as any,
      filesChanged: ["a.ts"],
      attempt: 0
    });
    expect(out.allowed).toBe(false);
    expect(out.reason).toBe("security_sensitive_requires_human_review");
  });

  it("analyzes failure evidence with affected files", () => {
    const analysis = service.analyzeFailure(
      {
        typecheck: {
          status: "failed",
          command: "tsc --noEmit",
          exitCode: 2,
          summary: "Type error",
          stderrSnippet: "apps/api/src/user.ts:12:5 - error TS2322: Type 'string' is not assignable"
        }
      },
      ["apps/api/src/user.ts"]
    );
    expect(analysis.failureType).toBe("typecheck_failure");
    expect(analysis.affectedFiles).toContain("apps/api/src/user.ts");
    expect(analysis.errorSummary).toContain("typecheck:");
  });

  it("classifies infra/environment failures as non-retryable", () => {
    process.env.MALV_CCI_AUTO_DEBUG_LOOP = "true";
    const out = service.shouldAttemptRetry({
      evidence: {
        tests: {
          status: "failed",
          command: "jest",
          exitCode: 1,
          summary: "system unavailable",
          stderrSnippet: "network timeout ECONNREFUSED"
        }
      },
      plan: { filesToModify: ["a.ts"], filesToCreate: [] } as any,
      audit: null,
      trustLevel: "controlled",
      planExecutionCoherence: { alignment: "full" } as any,
      filesChanged: ["a.ts"],
      attempt: 0
    });
    expect(out.allowed).toBe(false);
    expect(out.reason).toBe("infra_or_environment_failure");
  });

  it("generates bounded scope expansion when confidence is high", () => {
    const strategy = service.buildFixStrategy({
      failureAnalysis: {
        failureType: "typecheck_failure",
        affectedFiles: ["x.ts", "y.ts", "z.ts"],
        probableRootCause: "Type contract mismatch in scoped code.",
        errorSummary: "x.ts TS2322",
        severity: "medium",
        confidence: 0.9,
        evidence: []
      },
      plan: { filesToModify: ["a.ts"], filesToCreate: [] } as any,
      filesChanged: ["a.ts"]
    });
    expect(strategy.scopeExpansionRequested).toBe(true);
    expect(strategy.scopeExpansionApproved).toBe(false);
    expect(strategy.changeScope).not.toBe("expanded");
  });

  it("detects improvement and regression between attempts", () => {
    const improved = service.compareImprovement(
      {
        typecheck: { status: "failed", command: "tsc", exitCode: 2, summary: "2 errors", stderrSnippet: "error TS1005 error TS2322" },
        tests: { status: "failed", command: "jest", exitCode: 1, summary: "1 error", stderrSnippet: "error expected" }
      },
      {
        typecheck: { status: "passed", command: "tsc", exitCode: 0, summary: "ok" },
        tests: { status: "failed", command: "jest", exitCode: 1, summary: "1 error", stderrSnippet: "error expected" }
      }
    );
    expect(improved.improved).toBe(true);
    expect(improved.regression).toBe(false);

    const regressed = service.compareImprovement(
      {
        typecheck: { status: "failed", command: "tsc", exitCode: 2, summary: "1 error", stderrSnippet: "error TS2322" }
      },
      {
        typecheck: { status: "failed", command: "tsc", exitCode: 2, summary: "3 errors", stderrSnippet: "error TS2322 error TS1005 error TS2741" },
        lint: { status: "failed", command: "eslint .", exitCode: 1, summary: "1 error", stderrSnippet: "error no-unused-vars" }
      }
    );
    expect(regressed.regression).toBe(true);
  });

  it("tracks partial success correctly", () => {
    const partial = service.detectPartialSuccess(
      {
        typecheck: { status: "failed", command: "tsc", exitCode: 2, summary: "bad" },
        lint: { status: "failed", command: "eslint", exitCode: 1, summary: "bad" },
        tests: { status: "failed", command: "jest", exitCode: 1, summary: "bad" }
      },
      {
        typecheck: { status: "passed", command: "tsc", exitCode: 0, summary: "ok" },
        lint: { status: "passed", command: "eslint", exitCode: 0, summary: "ok" },
        tests: { status: "failed", command: "jest", exitCode: 1, summary: "bad" }
      }
    );
    expect(partial.compileFixed).toBe(true);
    expect(partial.lintImproved).toBe(true);
    expect(partial.testsImproved).toBe(false);
  });
});

