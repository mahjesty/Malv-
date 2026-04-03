import { Injectable, Logger } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import type {
  CodeFileNode,
  CodeFileRole,
  CodeGraphSnapshot,
  DependencyGraphAuditPayload,
  DependentIndex,
  FileDependencyEdge,
  FileIntelligenceHints,
  ModuleGraphEdge,
  SymbolRef,
  SymbolUsageEdge
} from "./code-graph.types";

const DEFAULT_TTL_MS = 120_000;
const DEFAULT_MAX_FILES = 12_000;
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "coverage",
  ".next",
  "build",
  "__pycache__",
  ".turbo"
]);

function inferRole(filePath: string): CodeFileRole {
  const base = path.basename(filePath).toLowerCase();
  const p = filePath.replace(/\\/g, "/").toLowerCase();
  if (p.includes("/migrations/") && base.endsWith(".ts")) return "migration";
  if (p.includes("/db/entities/") && base.endsWith(".entity.ts")) return "entity";
  if (base.endsWith(".entity.ts")) return "entity";
  if (base.includes("dto") && base.endsWith(".ts")) return "dto";
  if (base.endsWith("controller.ts")) return "controller";
  if (base.endsWith(".guard.ts") || p.includes("/guards/")) return "guard";
  if (base.endsWith(".repository.ts")) return "repository";
  if (base.endsWith("gateway.ts") || p.includes("/realtime/")) return "gateway";
  if (p.includes("/app/") && (base === "page.tsx" || base.endsWith("/page.tsx"))) return "page";
  if (base.startsWith("use") && base.endsWith(".ts")) return "hook";
  if (base.endsWith("service.ts") || base.endsWith(".service.ts")) return "service";
  if (base.endsWith("module.ts")) return "module";
  if (p.includes("/config") || base.includes("env")) return "config";
  return "other";
}

function moduleDirOf(repoRoot: string, filePath: string): string {
  const rel = path.relative(repoRoot, filePath);
  const parts = rel.split(path.sep).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "";
  return path.join(parts[0], parts[1]);
}

/** Walk up from cwd to find monorepo root containing apps/api/src. */
function findRepoRoot(startDir: string = process.cwd()): string {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, "apps", "api", "src");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(startDir);
}

function listTsFiles(rootDir: string, maxFiles: number, out: string[]): void {
  if (out.length >= maxFiles) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (out.length >= maxFiles) return;
    const full = path.join(rootDir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      listTsFiles(full, maxFiles, out);
    } else if (e.isFile() && (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) && !e.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
}

/** Matches `from 'module'` inside import declarations. */
const RE_FROM_SPEC = /\bfrom\s+['"]([^'"]+)['"]/g;
/** Side-effect imports: `import 'x'` */
const RE_IMPORT_SIDE = /^\s*import\s+['"]([^'"]+)['"]\s*;?/gm;
const RE_REQUIRE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const RE_DYNAMIC_IMPORT = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const RE_EXPORT_CLASS = /export\s+(?:abstract\s+)?class\s+(\w+)/g;
const RE_EXPORT_FN = /export\s+(?:async\s+)?function\s+(\w+)/g;
const RE_EXPORT_CONST = /export\s+const\s+(\w+)/g;
const RE_EXPORT_INTERFACE = /export\s+interface\s+(\w+)/g;
const RE_EXPORT_TYPE = /export\s+type\s+(\w+)/g;
const RE_NAMED_IMPORT = /import\s+(?:type\s+)?{([^}]+)}\s+from\s+['"]([^'"]+)['"]/g;

const RE_CONTROLLER = /@Controller\s*(?:\(\s*['"]([^'"]*)['"]\s*\))?/;
const RE_ROUTE_DECO = /@(Get|Post|Put|Patch|Delete|Options|Head)\s*\(/g;
const RE_GATEWAY = /@WebSocketGateway|WebSocketGateway/;
const RE_SUBSCRIBE = /@SubscribeMessage\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const RE_ENTITY_CLASS = /@Entity\s*\(\s*\)\s*(?:export\s+)?class\s+(\w+)/g;
const RE_REPO_EXTENDS = /class\s+(\w+)\s+extends\s+Repository\s*</g;
const RE_PROCESS_ENV = /process\.env\.([A-Z0-9_]+)/g;
const RE_DEFAULT_EXPORT_COMP = /export\s+default\s+function\s+(\w+)/;

function extractIntelligenceHints(content: string, filePath: string): FileIntelligenceHints {
  const hints: FileIntelligenceHints = {};
  const p = filePath.replace(/\\/g, "/").toLowerCase();
  if (RE_CONTROLLER.test(content)) hints.nestController = true;
  RE_CONTROLLER.lastIndex = 0;
  const decos: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = RE_ROUTE_DECO.exec(content))) decos.push(m[1]);
  RE_ROUTE_DECO.lastIndex = 0;
  if (decos.length) hints.nestRouteDecorators = Array.from(new Set(decos)).slice(0, 20);
  if (RE_GATEWAY.test(content)) hints.gatewaySocket = true;
  RE_GATEWAY.lastIndex = 0;
  const subs: string[] = [];
  while ((m = RE_SUBSCRIBE.exec(content))) subs.push(m[1]);
  RE_SUBSCRIBE.lastIndex = 0;
  if (subs.length) hints.subscribeMessages = subs.slice(0, 20);
  const entities: string[] = [];
  while ((m = RE_ENTITY_CLASS.exec(content))) entities.push(m[1]);
  RE_ENTITY_CLASS.lastIndex = 0;
  if (entities.length) hints.typeormEntityNames = entities.slice(0, 20);
  const repos: string[] = [];
  while ((m = RE_REPO_EXTENDS.exec(content))) repos.push(m[1]);
  RE_REPO_EXTENDS.lastIndex = 0;
  if (repos.length) hints.repositoryRefs = repos.slice(0, 20);
  const envKeys: string[] = [];
  while ((m = RE_PROCESS_ENV.exec(content))) envKeys.push(m[1]);
  RE_PROCESS_ENV.lastIndex = 0;
  if (envKeys.length) hints.processEnvKeys = Array.from(new Set(envKeys)).slice(0, 30);
  if (p.includes("/migrations/")) {
    const mi = content.match(/from\s+['"]([^'"]*entities\/[^'"]+)['"]/g);
    if (mi?.length) {
      hints.migrationEntityImports = mi.slice(0, 15).map((x) => x.replace(/from\s+['"]|['"]/g, ""));
    }
  }
  if (p.endsWith(".tsx") && RE_DEFAULT_EXPORT_COMP.test(content)) hints.defaultExportComponent = true;
  RE_DEFAULT_EXPORT_COMP.lastIndex = 0;
  if (path.basename(filePath).startsWith("use") && filePath.endsWith(".ts")) hints.hookPattern = true;
  return hints;
}

/** Group files by feature folder: apps/<app>/<src>/<feature>/... */
function moduleKeyForEdge(repoRoot: string, filePath: string): string {
  const rel = path.relative(repoRoot, filePath).replace(/\\/g, "/");
  const parts = rel.split("/").filter(Boolean);
  if (parts[0] === "apps" && parts.length >= 4) {
    return `${parts[0]}/${parts[1]}/${parts[2]}/${parts[3]}`;
  }
  if (parts.length >= 3) return `${parts[0]}/${parts[1]}/${parts[2]}`;
  if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
  return parts[0] ?? "unknown";
}

function buildModuleEdges(repoRoot: string, fileEdges: FileDependencyEdge[], cap: number): ModuleGraphEdge[] {
  const counts = new Map<string, number>();
  for (const e of fileEdges) {
    const a = moduleKeyForEdge(repoRoot, e.from);
    const b = moduleKeyForEdge(repoRoot, e.to);
    if (a === b) continue;
    const key = `${a}→${b}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const out: ModuleGraphEdge[] = [];
  for (const [k, edgeCount] of counts) {
    const [fromModule, toModule] = k.split("→");
    out.push({ fromModule, toModule, edgeCount });
  }
  out.sort((x, y) => y.edgeCount - x.edgeCount);
  return out.slice(0, cap);
}

function extractExports(content: string): SymbolRef[] {
  const out: SymbolRef[] = [];
  const add = (name: string, kind: SymbolRef["kind"]) => {
    if (name && !out.some((x) => x.name === name)) out.push({ name, kind });
  };
  let m: RegExpExecArray | null;
  while ((m = RE_EXPORT_CLASS.exec(content))) add(m[1], "class");
  RE_EXPORT_CLASS.lastIndex = 0;
  while ((m = RE_EXPORT_FN.exec(content))) add(m[1], "function");
  RE_EXPORT_FN.lastIndex = 0;
  while ((m = RE_EXPORT_CONST.exec(content))) add(m[1], "const");
  RE_EXPORT_CONST.lastIndex = 0;
  while ((m = RE_EXPORT_INTERFACE.exec(content))) add(m[1], "interface");
  RE_EXPORT_INTERFACE.lastIndex = 0;
  while ((m = RE_EXPORT_TYPE.exec(content))) add(m[1], "type");
  return out.slice(0, 80);
}

function parseImportsAndSymbols(content: string, fromFile: string, resolve: (spec: string) => string | null): { edges: FileDependencyEdge[]; usages: SymbolUsageEdge[] } {
  const edges: FileDependencyEdge[] = [];
  const usages: SymbolUsageEdge[] = [];
  const seen = new Set<string>();

  const addEdge = (spec: string, kind: FileDependencyEdge["kind"]) => {
    const to = resolve(spec);
    if (!to) return;
    const key = `${fromFile}|${to}|${kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from: fromFile, to, kind });
  };

  let m: RegExpExecArray | null;
  while ((m = RE_FROM_SPEC.exec(content))) {
    if (m[1]) addEdge(m[1], "static");
  }
  RE_FROM_SPEC.lastIndex = 0;
  while ((m = RE_IMPORT_SIDE.exec(content))) {
    if (m[1]) addEdge(m[1], "static");
  }
  RE_IMPORT_SIDE.lastIndex = 0;
  while ((m = RE_REQUIRE.exec(content))) {
    if (m[1]) addEdge(m[1], "dynamic");
  }
  RE_REQUIRE.lastIndex = 0;
  while ((m = RE_DYNAMIC_IMPORT.exec(content))) {
    if (m[1]) addEdge(m[1], "dynamic");
  }
  RE_DYNAMIC_IMPORT.lastIndex = 0;

  while ((m = RE_NAMED_IMPORT.exec(content))) {
    const names = m[1]
      .split(",")
      .map((s) => s.trim().split(/\s+as\s+/)[0]?.trim())
      .filter(Boolean) as string[];
    const spec = m[2];
    const to = resolve(spec);
    if (to && names.length) {
      usages.push({ from: fromFile, to, symbols: names.slice(0, 40) });
    }
  }
  RE_NAMED_IMPORT.lastIndex = 0;

  return { edges, usages };
}

function resolveImportSpecifier(fromFile: string, spec: string, knownFiles: Set<string>): string | null {
  if (!spec || spec.startsWith("node:")) return null;
  if (spec.startsWith("@nestjs/") || spec.startsWith("rxjs") || spec.startsWith("typeorm")) return null;
  const baseDir = path.dirname(fromFile);
  if (spec.startsWith(".")) {
    const resolved = path.normalize(path.join(baseDir, spec));
    const candidates = [`${resolved}.ts`, `${resolved}.tsx`, path.join(resolved, "index.ts"), path.join(resolved, "index.tsx")];
    for (const c of candidates) {
      const norm = path.normalize(c);
      if (knownFiles.has(norm)) return norm;
    }
    return null;
  }
  return null;
}

function fingerprintRoots(repoRoot: string): string {
  const parts: string[] = [];
  const tryStat = (p: string) => {
    try {
      const st = fs.statSync(p);
      parts.push(`${path.basename(p)}:${st.mtimeMs}`);
    } catch {
      parts.push("missing");
    }
  };
  tryStat(path.join(repoRoot, "package.json"));
  tryStat(path.join(repoRoot, "apps", "api", "package.json"));
  return parts.join("|");
}

@Injectable()
export class CodeGraphService {
  private readonly logger = new Logger(CodeGraphService.name);
  private cache: CodeGraphSnapshot | null = null;
  private cacheExpiresAt = 0;
  private cacheFp = "";

  private get ttlMs(): number {
    const raw = process.env.MALV_CODE_GRAPH_TTL_MS;
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_TTL_MS;
  }

  private get maxFiles(): number {
    const raw = process.env.MALV_CODE_GRAPH_MAX_FILES;
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n > 500 ? n : DEFAULT_MAX_FILES;
  }

  /** Test hook: drop cached graph. */
  invalidateCache(): void {
    this.cache = null;
    this.cacheExpiresAt = 0;
    this.cacheFp = "";
  }

  /** Compact graph summary for persisting on audit rows (bounded samples). */
  buildAuditPayload(snapshot: CodeGraphSnapshot): DependencyGraphAuditPayload {
    const cap = 40;
    const rel = (p: string) => path.relative(snapshot.repoRoot, p).replace(/\\/g, "/");
    return {
      cacheKey: snapshot.cacheKey,
      generatedAt: snapshot.generatedAt,
      scanRoots: snapshot.scanRoots.map((r) => rel(r)),
      fileCount: snapshot.fileCount,
      edgeCount: snapshot.edgeCount,
      symbolEdgeSample: snapshot.symbolEdges.slice(0, cap).map((e) => ({
        from: rel(e.from),
        to: rel(e.to),
        symbols: e.symbols
      })),
      fileEdgeSample: snapshot.fileEdges.slice(0, cap).map((e) => ({
        from: rel(e.from),
        to: rel(e.to),
        kind: e.kind
      })),
      moduleEdgeSample: snapshot.moduleEdges.slice(0, 30)
    };
  }

  /**
   * Returns cached snapshot when TTL and repo fingerprint match; otherwise rebuilds.
   */
  getOrBuildGraph(): CodeGraphSnapshot {
    const repoRoot = findRepoRoot();
    const fp = fingerprintRoots(repoRoot);
    const now = Date.now();
    if (this.cache && now < this.cacheExpiresAt && this.cacheFp === fp && this.cache.repoRoot === repoRoot) {
      return this.cache;
    }
    const built = this.buildGraph(repoRoot, fp);
    this.cache = built;
    this.cacheFp = fp;
    this.cacheExpiresAt = now + this.ttlMs;
    return built;
  }

  private buildGraph(repoRoot: string, fp: string): CodeGraphSnapshot {
    const scanRoots = [
      path.join(repoRoot, "apps", "api", "src"),
      path.join(repoRoot, "apps", "web", "src")
    ].filter((p) => fs.existsSync(p));

    const files: string[] = [];
    for (const r of scanRoots) {
      listTsFiles(r, this.maxFiles, files);
      if (files.length >= this.maxFiles) break;
    }

    const known = new Set(files.map((f) => path.normalize(f)));
    const nodes: Record<string, CodeFileNode> = {};
    const fileEdges: FileDependencyEdge[] = [];
    const symbolEdges: SymbolUsageEdge[] = [];

    for (const file of files) {
      let content: string;
      try {
        content = fs.readFileSync(file, "utf8");
      } catch {
        continue;
      }
      const resolve = (spec: string) => resolveImportSpecifier(file, spec, known);
      const { edges, usages } = parseImportsAndSymbols(content, file, resolve);
      fileEdges.push(...edges);
      symbolEdges.push(...usages);
      const intel = extractIntelligenceHints(content, file);
      nodes[file] = {
        path: file,
        role: inferRole(file),
        moduleDir: moduleDirOf(repoRoot, file),
        imports: [...new Set(edges.map((e) => e.to))],
        exports: extractExports(content),
        intelligence: intel
      };
    }

    const dependents: DependentIndex = {};
    for (const e of fileEdges) {
      if (!dependents[e.to]) dependents[e.to] = [];
      dependents[e.to].push(e.from);
    }
    for (const k of Object.keys(dependents)) {
      dependents[k] = Array.from(new Set(dependents[k])).sort();
    }

    const moduleEdges = buildModuleEdges(repoRoot, fileEdges, 200);

    const snap: CodeGraphSnapshot = {
      repoRoot,
      generatedAt: Date.now(),
      scanRoots,
      fileCount: Object.keys(nodes).length,
      edgeCount: fileEdges.length,
      nodes,
      fileEdges,
      dependents,
      symbolEdges,
      moduleEdges,
      cacheKey: fp
    };

    this.logger.debug(
      `Code graph built: ${snap.fileCount} files, ${snap.edgeCount} import edges (roots=${scanRoots.length})`
    );
    return snap;
  }

  /** Collect transitive imports up to depth (upstream = what this file depends on). */
  collectUpstream(startFiles: string[], maxDepth: number, maxNodes: number): string[] {
    const snap = this.getOrBuildGraph();
    const seen = new Set<string>();
    let frontier = startFiles.map((f) => path.normalize(f)).filter((f) => snap.nodes[f]);
    let depth = 0;
    while (frontier.length && depth < maxDepth && seen.size < maxNodes) {
      const next: string[] = [];
      for (const f of frontier) {
        if (seen.has(f)) continue;
        seen.add(f);
        const node = snap.nodes[f];
        if (!node) continue;
        for (const imp of node.imports) {
          if (!seen.has(imp)) next.push(imp);
        }
      }
      frontier = next;
      depth++;
    }
    return Array.from(seen);
  }

  /** Files that (transitively) depend on any start file — downstream risk. */
  collectDownstream(startFiles: string[], maxDepth: number, maxNodes: number): string[] {
    const snap = this.getOrBuildGraph();
    const seen = new Set<string>();
    let frontier = startFiles.map((f) => path.normalize(f)).filter((f) => snap.nodes[f]);
    let depth = 0;
    while (frontier.length && depth < maxDepth && seen.size < maxNodes) {
      const next: string[] = [];
      for (const f of frontier) {
        if (seen.has(f)) continue;
        seen.add(f);
        const deps = snap.dependents[f] ?? [];
        for (const d of deps) {
          if (!seen.has(d)) next.push(d);
        }
      }
      frontier = next;
      depth++;
    }
    return Array.from(seen);
  }
}
