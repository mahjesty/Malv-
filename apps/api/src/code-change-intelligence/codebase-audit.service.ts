import { Injectable } from "@nestjs/common";
import * as path from "path";
import * as fs from "fs";
import type {
  ChangeAuditResult,
  ChangeScopeClassification,
  ExtensionIntelligence,
  ImpactedAreas,
  ImpactIntelligence,
  RepoPatternHints
} from "./change-intelligence.types";
import { CodeGraphService } from "./code-graph.service";
import type { CodeGraphSnapshot } from "./code-graph.types";

const UPSTREAM_DEPTH = 5;
const UPSTREAM_CAP = 220;
const DOWNSTREAM_DEPTH = 4;
const DOWNSTREAM_CAP = 180;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_/]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "when",
  "what",
  "make",
  "add",
  "new",
  "use",
  "all",
  "not",
  "are",
  "but",
  "has",
  "was",
  "how",
  "our",
  "out",
  "get",
  "can",
  "fix",
  "bug"
]);

@Injectable()
export class CodebaseAuditService {
  constructor(private readonly codeGraph: CodeGraphService) {}

  audit(args: { requestedGoal: string; hints?: string[] }): ChangeAuditResult {
    const goal = args.requestedGoal.toLowerCase();
    const text = `${goal} ${(args.hints ?? []).join(" ").toLowerCase()}`;
    const has = (re: RegExp) => re.test(text);
    const impactedAreas: ImpactedAreas = {
      frontend: has(/\b(ui|frontend|react|web|page|component|layout)\b/),
      backend: has(/\b(api|backend|service|controller|module|endpoint)\b/),
      dtoSchema: has(/\b(dto|schema|contract|payload|type)\b/),
      authPermissions: has(/\b(auth|permission|rbac|role|guard|token|jwt)\b/),
      realtimeEvents: has(/\b(realtime|socket|websocket|event|stream)\b/),
      tests: true,
      dbMigrations: has(/\b(db|database|migration|entity|table|sql)\b/),
      configEnv: has(/\b(env|config|setting|secret|flag)\b/)
    };

    const relatedFiles = this.relatedFilesFromAreas(impactedAreas);
    const snapshot = this.codeGraph.getOrBuildGraph();
    const tokens = tokenize(`${args.requestedGoal} ${(args.hints ?? []).join(" ")}`);

    const keywordSeeds = this.rankSeedsByKeywords(snapshot, tokens);
    const seeds = this.mergeSeeds(keywordSeeds, relatedFiles, snapshot);

    const upstream = this.codeGraph.collectUpstream(seeds, UPSTREAM_DEPTH, UPSTREAM_CAP);
    const downstream = this.codeGraph.collectDownstream(seeds, DOWNSTREAM_DEPTH, DOWNSTREAM_CAP);

    const rel = (p: string) => path.relative(snapshot.repoRoot, p).replace(/\\/g, "/");

    const impactedAbs = Array.from(new Set([...seeds, ...upstream, ...downstream])).sort();
    const impactedFiles = impactedAbs.map(rel);

    const dependencyGraph = this.codeGraph.buildAuditPayload(snapshot);
    const repoPatterns = this.buildRepoPatterns(snapshot, seeds);
    const impactIntelligence = this.buildImpactIntelligence(snapshot, seeds, downstream, impactedAbs, rel, impactedAreas);
    const impactAnalysis = {
      summary: impactIntelligence.summary,
      mayBreakIfChanged: impactIntelligence.mayBreakIfChanged,
      dependentModules: impactIntelligence.dependentModules,
      regressionTesting: impactIntelligence.regressionTesting
    };
    const extensionIntelligence = this.buildExtensionIntelligence(snapshot, seeds, repoPatterns, impactedAreas);
    const scopeClassification = this.classifyScope(snapshot, seeds, impactedAbs, impactedAreas, text);

    const summary = this.buildSummary(impactedAreas, impactedFiles.length, seeds.length, dependencyGraph.edgeCount);

    const relatedResolved = relatedFiles
      .map((f) => {
        const abs = path.isAbsolute(f) ? f : path.join(snapshot.repoRoot, f);
        return snapshot.nodes[path.normalize(abs)] ? rel(path.normalize(abs)) : f;
      })
      .filter((x, i, a) => a.indexOf(x) === i);

    return {
      summary,
      impactedAreas,
      relatedFiles: relatedResolved,
      impactedFiles,
      upstreamDependencies: upstream
        .filter((f) => !seeds.includes(f))
        .map(rel)
        .sort(),
      downstreamEffects: downstream
        .filter((f) => !seeds.includes(f))
        .map(rel)
        .sort(),
      dependencyGraph,
      impactAnalysis,
      impactIntelligence,
      repoPatterns,
      extensionIntelligence,
      scopeClassification,
      architectureNotes: this.buildArchitectureNotes(impactedAreas, repoPatterns),
      riskNotes:
        "Main risk surfaces: API/UI contract drift, status transition mistakes, auth/approval bypass, migration-side regressions, and unintended downstream breakage when shared modules change.",
      securityNotes:
        "No sandbox policy weakening is allowed. Sensitive or critical scopes must require approval checkpoint before apply."
    };
  }

  private buildSummary(areas: ImpactedAreas, impactedCount: number, seedCount: number, edgeCount: number): string {
    const flags = Object.entries(areas)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(", ");
    return `Repo intelligence audit: ${impactedCount} files in scope (${seedCount} seeds) across [${flags}]. Import graph has ${edgeCount} internal edges.`;
  }

  private buildArchitectureNotes(areas: ImpactedAreas, patterns: RepoPatternHints): string {
    const base =
      "Use existing Nest module boundaries and TypeORM migration-first persistence. Prefer extending existing services over introducing parallel paths.";
    const ext =
      patterns.saferExtensionPoints.length > 0
        ? ` Suggested extension points: ${patterns.saferExtensionPoints.slice(0, 5).join("; ")}.`
        : "";
    const mod =
      areas.backend && areas.frontend
        ? " Coordinate API and web contract changes to avoid drift."
        : "";
    return `${base}${ext}${mod}`;
  }

  private mergeSeeds(keywordSeeds: string[], areaFiles: string[], snapshot: CodeGraphSnapshot): string[] {
    const norm = (p: string) => path.normalize(p);
    const resolveExisting = (rel: string) => {
      const abs = path.isAbsolute(rel) ? norm(rel) : norm(path.join(snapshot.repoRoot, rel));
      if (snapshot.nodes[abs]) return abs;
      if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
        const child = Object.keys(snapshot.nodes)
          .filter((k) => k.startsWith(abs + path.sep))
          .sort()[0];
        return child ?? null;
      }
      const relSlash = rel.replace(/\\/g, "/");
      const fuzzy = Object.keys(snapshot.nodes)
        .filter((k) => k.replace(/\\/g, "/").includes(relSlash))
        .sort()[0];
      return fuzzy ?? null;
    };

    const out: string[] = [...keywordSeeds];
    for (const f of areaFiles) {
      const x = resolveExisting(f);
      if (x) out.push(x);
    }
    return Array.from(new Set(out));
  }

  private rankSeedsByKeywords(snapshot: CodeGraphSnapshot, tokens: string[]): string[] {
    if (tokens.length === 0) return [];
    const scored: { p: string; s: number }[] = [];
    for (const [p, node] of Object.entries(snapshot.nodes)) {
      const pl = p.toLowerCase();
      let s = 0;
      for (const t of tokens) {
        if (pl.includes(t)) s += 3;
        if (path.basename(pl).includes(t)) s += 5;
        if (node.moduleDir.toLowerCase().includes(t)) s += 2;
      }
      if (s > 0) scored.push({ p, s });
    }
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, 24).map((x) => x.p);
  }

  private relatedFilesFromAreas(areas: ImpactedAreas): string[] {
    const out = ["apps/api/src/beast/beast.orchestrator.service.ts"];
    if (areas.backend) out.push("apps/api/src/app.module.ts");
    if (areas.dbMigrations) out.push("apps/api/src/db/migrations");
    if (areas.authPermissions) out.push("apps/api/src/auth");
    if (areas.realtimeEvents) out.push("apps/api/src/realtime/realtime.gateway.ts");
    if (areas.frontend) out.push("apps/web/src/lib/chat/malvChatClient.ts");
    return Array.from(new Set(out));
  }

  private buildRepoPatterns(snapshot: CodeGraphSnapshot, seeds: string[]): RepoPatternHints {
    const duplicateLogicHints = this.findDuplicateBasenames(snapshot);
    const similarPatterns: string[] = [];
    const saferExtensionPoints: string[] = [];

    const dirs = new Set<string>();
    for (const s of seeds.slice(0, 8)) {
      dirs.add(path.dirname(s));
    }

    for (const d of dirs) {
      const siblings = Object.keys(snapshot.nodes).filter((p) => path.dirname(p) === d && p !== d);
      const modules = siblings.filter((p) => p.endsWith("module.ts"));
      const services = siblings.filter((p) => p.endsWith("service.ts") && !seeds.includes(p));
      saferExtensionPoints.push(...modules.slice(0, 2), ...services.slice(0, 1));
      similarPatterns.push(
        ...siblings
          .filter((p) => /service|controller|gateway|guard/.test(path.basename(p)))
          .slice(0, 4)
          .map((p) => `Near ${path.basename(d)}: ${path.relative(snapshot.repoRoot, p)}`)
      );
    }

    const uniq = (xs: string[]) => Array.from(new Set(xs)).filter(Boolean);

    return {
      duplicateLogicHints: duplicateLogicHints.slice(0, 12),
      similarPatterns: uniq(similarPatterns).slice(0, 12),
      saferExtensionPoints: uniq(saferExtensionPoints)
        .map((p) => path.relative(snapshot.repoRoot, p))
        .slice(0, 10)
    };
  }

  private findDuplicateBasenames(snapshot: CodeGraphSnapshot): string[] {
    const byBase = new Map<string, string[]>();
    for (const p of Object.keys(snapshot.nodes)) {
      const b = path.basename(p);
      if (b === "index.ts") continue;
      const arr = byBase.get(b) ?? [];
      arr.push(p);
      byBase.set(b, arr);
    }
    const hints: string[] = [];
    for (const [b, paths] of byBase) {
      if (paths.length < 2) continue;
      const roles = new Set(paths.map((p) => snapshot.nodes[p]?.role ?? "other"));
      if (roles.size === 1) {
        hints.push(
          `Same filename "${b}" in ${paths.length} places (${paths
            .slice(0, 3)
            .map((x) => path.relative(snapshot.repoRoot, x))
            .join(", ")}) — verify before duplicating logic.`
        );
      }
    }
    return hints;
  }

  private buildImpactIntelligence(
    snapshot: CodeGraphSnapshot,
    seeds: string[],
    downstream: string[],
    impactedAbs: string[],
    rel: (abs: string) => string,
    areas: ImpactedAreas
  ): ImpactIntelligence {
    const directImporters = new Set<string>();
    for (const s of seeds) {
      for (const d of snapshot.dependents[s] ?? []) {
        directImporters.add(d);
      }
    }
    const mayBreakIfChanged = Array.from(directImporters)
      .map((p) => rel(p))
      .sort()
      .slice(0, 40);

    const modSet = new Set<string>();
    for (const p of [...downstream, ...seeds]) {
      const n = snapshot.nodes[p];
      if (n?.moduleDir) modSet.add(n.moduleDir);
    }
    const dependentModules = Array.from(modSet)
      .map((m) => rel(path.join(snapshot.repoRoot, m)))
      .sort()
      .slice(0, 30);

    const regressionTesting: string[] = [
      "Unit tests for touched services and guards.",
      "API contract tests for any changed controllers or DTOs.",
      "End-to-end or smoke paths covering modules: " + dependentModules.slice(0, 6).join(", ")
    ];
    if (downstream.length > 20) {
      regressionTesting.push("Broad regression: downstream graph exceeds 20 files — run focused integration suite.");
    }

    const summary = `Changing ${seeds.length} seed file(s) may affect ${directImporters.size} direct importer(s) and ${downstream.length} file(s) in the downstream cone (transitive). Review dependent modules before shipping.`;

    const directlyTouched: string[] = seeds.map(rel);
    const dependentFiles = [...downstream.map((p) => rel(p)), ...upstreamOnly(seeds, impactedAbs).map((p) => rel(p))];

    const contractsAtRisk: string[] = [];
    for (const p of impactedAbs) {
      const n = snapshot.nodes[p];
      if (!n) continue;
      if (n.role === "dto" || n.role === "controller") {
        contractsAtRisk.push(rel(p));
      }
      if (n.intelligence?.nestRouteDecorators?.length) {
        contractsAtRisk.push(`${rel(p)} (HTTP routes)`);
      }
    }

    const testsRecommended = [...regressionTesting];
    if (areas.frontend) testsRecommended.push("Visual regression / responsive smoke on touched routes (apps/web).");

    const userFacingFlowsLikely: string[] = [];
    if (areas.frontend) {
      userFacingFlowsLikely.push("Web UI surfaces under apps/web may be affected");
    }
    for (const p of impactedAbs) {
      const n = snapshot.nodes[p];
      if (n?.role === "controller" || n?.role === "gateway") {
        userFacingFlowsLikely.push(`API/Gateway surface: ${rel(p)}`);
      }
    }

    const authRealtimeSecurityIntersections: string[] = [];
    if (areas.authPermissions) authRealtimeSecurityIntersections.push("Auth/permission paths flagged by goal text");
    if (areas.realtimeEvents) authRealtimeSecurityIntersections.push("Realtime / gateway / websocket surfaces in scope");
    for (const p of impactedAbs) {
      const pl = p.toLowerCase();
      if (pl.includes("/auth/") || pl.includes("guard")) {
        authRealtimeSecurityIntersections.push(rel(p));
      }
      if (pl.includes("realtime") || pl.includes("gateway")) {
        authRealtimeSecurityIntersections.push(rel(p));
      }
    }

    const migrationsConfigEnvSurfaces: string[] = [];
    if (areas.dbMigrations) migrationsConfigEnvSurfaces.push("db/migrations and entity coupling");
    if (areas.configEnv) migrationsConfigEnvSurfaces.push("config/env surfaces");
    for (const p of impactedAbs) {
      const n = snapshot.nodes[p];
      if (n?.role === "migration" || n?.role === "entity") migrationsConfigEnvSurfaces.push(rel(p));
      if (n?.intelligence?.processEnvKeys?.length) {
        migrationsConfigEnvSurfaces.push(`${rel(p)} (reads env: ${n.intelligence.processEnvKeys.slice(0, 4).join(", ")})`);
      }
    }

    return {
      summary,
      mayBreakIfChanged,
      dependentModules,
      regressionTesting,
      directlyTouchedFiles: directlyTouched,
      dependentFiles: Array.from(new Set(dependentFiles)).slice(0, 120),
      contractsAtRisk: Array.from(new Set(contractsAtRisk)).slice(0, 40),
      testsRecommended,
      userFacingFlowsLikely: Array.from(new Set(userFacingFlowsLikely)).slice(0, 20),
      authRealtimeSecurityIntersections: Array.from(new Set(authRealtimeSecurityIntersections)).slice(0, 25),
      migrationsConfigEnvSurfaces: Array.from(new Set(migrationsConfigEnvSurfaces)).slice(0, 25)
    };
  }

  private buildExtensionIntelligence(
    snapshot: CodeGraphSnapshot,
    seeds: string[],
    patterns: RepoPatternHints,
    areas: ImpactedAreas
  ): ExtensionIntelligence {
    const idealPlugInPoints = [...patterns.saferExtensionPoints.slice(0, 8)];
    const riskyPatchPoints: string[] = [];
    for (const s of seeds.slice(0, 12)) {
      const n = snapshot.nodes[s];
      if (n?.role === "module" || path.basename(s).includes("app.module")) {
        riskyPatchPoints.push(path.relative(snapshot.repoRoot, s));
      }
    }
    let primary = "service";
    const alternates: string[] = [];
    if (areas.frontend) {
      primary = "component_or_page";
      alternates.push("hook", "layout", "module");
    }
    if (areas.dtoSchema || areas.backend) alternates.push("dto", "controller");
    if (areas.dbMigrations) alternates.push("entity", "migration");
    if (areas.realtimeEvents) alternates.push("gateway", "module");
    const rationale = `Primary layer inferred from impacted areas (frontend=${areas.frontend}, backend=${areas.backend}, dto=${areas.dtoSchema}, db=${areas.dbMigrations}). Prefer extending existing module wiring over new parallel trees.`;

    return {
      idealPlugInPoints,
      similarPatterns: patterns.similarPatterns,
      duplicationWarnings: patterns.duplicateLogicHints,
      saferExtensionPoints: patterns.saferExtensionPoints,
      riskyPatchPoints: riskyPatchPoints.slice(0, 10),
      layerHints: {
        primary,
        alternates: Array.from(new Set(alternates)),
        rationale
      }
    };
  }

  private classifyScope(
    snapshot: CodeGraphSnapshot,
    seeds: string[],
    impactedAbs: string[],
    areas: ImpactedAreas,
    goalText: string
  ): ChangeScopeClassification {
    const rationale: string[] = [];
    const seedMods = new Set(seeds.map((s) => snapshot.nodes[s]?.moduleDir).filter(Boolean));
    const crossModule = seedMods.size > 2 || impactedAbs.length > 40;
    if (crossModule) rationale.push("Multiple modules or large cone → cross-module risk.");

    const roles = new Set(seeds.map((s) => snapshot.nodes[s]?.role ?? "other"));
    const contractChanging = roles.has("dto") || roles.has("controller") || areas.dtoSchema;
    if (contractChanging) rationale.push("DTO/controller involvement → contract-sensitive.");

    const dataModelChanging = roles.has("entity") || roles.has("migration") || areas.dbMigrations;
    if (dataModelChanging) rationale.push("Entity/migration involvement → data model sensitivity.");

    const securitySensitive = areas.authPermissions || areas.configEnv || roles.has("guard");
    if (securitySensitive) rationale.push("Auth/config/guard intersection → security-sensitive.");

    const uxSensitive = areas.frontend;
    if (uxSensitive) rationale.push("Frontend/UI scope → UX-sensitive.");

    const perfHint = /\b(perf|performance|slow|cache|bundle|latency)\b/i.test(goalText);
    const performanceSensitive = perfHint || areas.realtimeEvents || impactedAbs.length > 60;
    if (performanceSensitive) rationale.push("Performance/realtime keywords or large scope → performance-sensitive.");

    const minimalLocalized = impactedAbs.length <= 10 && seeds.length <= 4 && !crossModule;
    if (minimalLocalized) rationale.push("Small cone → likely localized change.");

    return {
      minimalLocalized,
      crossModule,
      contractChanging,
      dataModelChanging,
      securitySensitive,
      uxSensitive,
      performanceSensitive,
      rationale
    };
  }
}

function upstreamOnly(seeds: string[], impactedAbs: string[]): string[] {
  const seedSet = new Set(seeds);
  return impactedAbs.filter((p) => !seedSet.has(p));
}
