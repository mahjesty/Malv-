/** Role inferred from path/name for module intelligence. */
export type CodeFileRole =
  | "service"
  | "controller"
  | "dto"
  | "entity"
  | "module"
  | "guard"
  | "hook"
  | "page"
  | "repository"
  | "gateway"
  | "migration"
  | "config"
  | "other";

/** Directed edge in the file dependency graph. */
export type FileDependencyEdge = {
  from: string;
  to: string;
  kind: "static" | "dynamic";
};

/** Lightweight symbol reference for cross-file usage heuristics. */
export type SymbolRef = {
  name: string;
  kind: "class" | "function" | "interface" | "type" | "const" | "unknown";
};

/** Per-file structural hints (regex/heuristic, bounded). */
export type FileIntelligenceHints = {
  nestController?: boolean;
  nestRouteDecorators?: string[];
  gatewaySocket?: boolean;
  subscribeMessages?: string[];
  typeormEntityNames?: string[];
  repositoryRefs?: string[];
  processEnvKeys?: string[];
  migrationEntityImports?: string[];
  defaultExportComponent?: boolean;
  hookPattern?: boolean;
};

/** Per-file node in the code graph. */
export type CodeFileNode = {
  path: string;
  role: CodeFileRole;
  moduleDir: string;
  /** Resolved internal import targets (project files). */
  imports: string[];
  /** Exported symbol names (best-effort regex). */
  exports: SymbolRef[];
  /** Deeper hints (bounded). */
  intelligence: FileIntelligenceHints;
};

/** Reverse index: file -> files that import it. */
export type DependentIndex = Record<string, string[]>;

/** Optional symbol usage: importer -> imported symbol names (from named imports). */
export type SymbolUsageEdge = {
  from: string;
  to: string;
  symbols: string[];
};

/** Aggregated module → module dependency (apps/api/src/... or apps/web/src/...). */
export type ModuleGraphEdge = {
  fromModule: string;
  toModule: string;
  edgeCount: number;
};

/** Full in-memory snapshot used by audit and planning. */
export type CodeGraphSnapshot = {
  repoRoot: string;
  generatedAt: number;
  scanRoots: string[];
  fileCount: number;
  edgeCount: number;
  nodes: Record<string, CodeFileNode>;
  fileEdges: FileDependencyEdge[];
  dependents: DependentIndex;
  symbolEdges: SymbolUsageEdge[];
  /** Top cross-module edges by count (bounded). */
  moduleEdges: ModuleGraphEdge[];
  /** Cache metadata */
  cacheKey: string;
};

/** Trimmed payload safe to persist on audit rows. */
export type DependencyGraphAuditPayload = {
  cacheKey: string;
  generatedAt: number;
  scanRoots: string[];
  fileCount: number;
  edgeCount: number;
  symbolEdgeSample: SymbolUsageEdge[];
  /** Cap for UI / storage */
  fileEdgeSample: FileDependencyEdge[];
  moduleEdgeSample: ModuleGraphEdge[];
};
