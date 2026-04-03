import * as path from "path";
import { CodebaseAuditService } from "./codebase-audit.service";
import { CodeGraphService } from "./code-graph.service";
import type { CodeGraphSnapshot, FileIntelligenceHints } from "./code-graph.types";

function mockSnapshot(): {
  snapshot: CodeGraphSnapshot;
  seed: string;
  lib: string;
  consumer: string;
} {
  const r = path.normalize("/repo/malv");
  const seed = path.join(r, "apps/api/src/feature/seed.service.ts");
  const lib = path.join(r, "apps/api/src/lib/shared.util.ts");
  const consumer = path.join(r, "apps/api/src/app/consumer.service.ts");
  const emptyIntel: FileIntelligenceHints = {};
  const snapshot: CodeGraphSnapshot = {
    repoRoot: r,
    generatedAt: Date.now(),
    scanRoots: [path.join(r, "apps/api/src")],
    fileCount: 3,
    edgeCount: 2,
    nodes: {
      [seed]: {
        path: seed,
        role: "service",
        moduleDir: "apps/api",
        imports: [lib],
        exports: [{ name: "Seed", kind: "class" }],
        intelligence: emptyIntel
      },
      [lib]: { path: lib, role: "other", moduleDir: "apps/api", imports: [], exports: [], intelligence: emptyIntel },
      [consumer]: {
        path: consumer,
        role: "service",
        moduleDir: "apps/api",
        imports: [seed],
        exports: [],
        intelligence: emptyIntel
      }
    },
    fileEdges: [
      { from: seed, to: lib, kind: "static" },
      { from: consumer, to: seed, kind: "static" }
    ],
    dependents: {
      [lib]: [seed],
      [seed]: [consumer]
    },
    symbolEdges: [{ from: consumer, to: seed, symbols: ["Seed"] }],
    moduleEdges: [{ fromModule: "apps/api/src/feature", toModule: "apps/api/src/lib", edgeCount: 1 }],
    cacheKey: "test-cache"
  };
  return { snapshot, seed, lib, consumer };
}

describe("CodebaseAuditService (repo intelligence)", () => {
  it("audit includes dependency graph output with samples and counts", () => {
    const graph = new CodeGraphService();
    const { snapshot: snap } = mockSnapshot();
    jest.spyOn(graph, "getOrBuildGraph").mockReturnValue(snap);
    const audit = new CodebaseAuditService(graph).audit({
      requestedGoal: "improve the seed service reliability",
      hints: []
    });

    expect(audit.dependencyGraph.fileCount).toBe(3);
    expect(audit.dependencyGraph.edgeCount).toBe(2);
    expect(audit.dependencyGraph.fileEdgeSample.length).toBeGreaterThan(0);
    expect(audit.dependencyGraph.cacheKey).toBe("test-cache");
  });

  it("impacted files include upstream and downstream beyond direct keyword matches", () => {
    const graph = new CodeGraphService();
    const { snapshot: snap, lib, consumer } = mockSnapshot();
    jest.spyOn(graph, "getOrBuildGraph").mockReturnValue(snap);
    const audit = new CodebaseAuditService(graph).audit({
      requestedGoal: "change seed service behavior",
      hints: []
    });

    const rel = (abs: string) => path.relative(snap.repoRoot, abs).replace(/\\/g, "/");
    const impacted = new Set(audit.impactedFiles);
    expect(impacted.has(rel(lib))).toBe(true);
    expect(impacted.has(rel(consumer))).toBe(true);
    expect(audit.impactAnalysis.mayBreakIfChanged.length).toBeGreaterThan(0);
  });
});
