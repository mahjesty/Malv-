/**
 * Deterministic frontend preview capability classifier.
 *
 * Classifies uploaded source files into preview capability classes and
 * determines the rendering support level. No model inference required.
 *
 * Classification is based on:
 *   - filename / extension
 *   - source tree / uploaded file set
 *   - source content heuristics (imports, JSX/TSX syntax)
 *   - package.json when present
 *   - known entrypoint names
 */

export type FrontendPreviewClass =
  | "static_html_document"
  | "html_css_js_bundle"
  | "javascript_dom_app"
  | "typescript_dom_app"
  | "react_component"
  | "react_page"
  | "next_route_candidate"
  | "css_asset_only"
  | "utility_module"
  | "non_renderable_frontend_source";

/**
 * How the sandbox will handle rendering.
 * - direct: serve as-is in iframe (HTML)
 * - transpile: TSX/JSX → JS transform needed, then wrap in mount harness
 * - bundle: multi-file assembly + transpile
 * - unsupported: cannot produce a safe preview
 */
export type FrontendSupportLevel = "direct" | "transpile" | "bundle" | "unsupported";

export type FrontendPreviewCapability = {
  previewClass: FrontendPreviewClass;
  previewable: boolean;
  supportLevel: FrontendSupportLevel;
  /** Detected entrypoint candidates in priority order. */
  entryCandidates: string[];
  /** Primary entry to use for bundling (first valid candidate). */
  primaryEntry: string | null;
  /** Files required to render. */
  requiredFiles: string[];
  /** Human-readable reason why something is unsupported or degraded. */
  unsupportedReason: string | null;
  /** Diagnostic signals for dev panel. */
  signals: {
    hasHtml: boolean;
    hasTsx: boolean;
    hasJsx: boolean;
    hasTs: boolean;
    hasJs: boolean;
    hasCss: boolean;
    hasPackageJson: boolean;
    hasNextDep: boolean;
    hasReactDep: boolean;
    hasNextPathPattern: boolean;
    hasNextImport: boolean;
    hasReactImport: boolean;
    hasJsxSyntax: boolean;
    isMultiFile: boolean;
    fileCount: number;
    detectedFramework: string | null;
  };
};

export type ClassifiableSourceFile = {
  path: string;
  content: string;
};

function baseName(p: string): string {
  return p.replace(/\\/g, "/").split("/").pop() ?? p;
}

const KNOWN_ENTRYPOINTS = new Set([
  "index.html",
  "index.htm",
  "main.tsx",
  "main.jsx",
  "main.ts",
  "main.js",
  "index.tsx",
  "index.jsx",
  "index.ts",
  "index.js",
  "app.tsx",
  "App.tsx",
  "app.jsx",
  "App.jsx",
  "app/page.tsx",
  "app/page.jsx",
  "pages/index.tsx",
  "pages/index.jsx",
  "pages/_app.tsx",
  "pages/_app.jsx"
]);

/** Next.js app/pages router file path patterns. */
const NEXT_PAGE_PATH_RE = new RegExp(
  "(^|/)((app/(page|layout|loading|error|not-found|route)|pages/[^/]+)\\.(tsx|jsx|ts|js)$)",
  "i"
);

function parsePackageJsonDeps(content: string): { hasReact: boolean; hasNext: boolean } {
  try {
    const p = JSON.parse(content) as unknown;
    if (!p || typeof p !== "object" || Array.isArray(p)) return { hasReact: false, hasNext: false };
    const all = {
      ...((p as Record<string, unknown>).dependencies ?? {}),
      ...((p as Record<string, unknown>).devDependencies ?? {})
    } as Record<string, unknown>;
    return {
      hasReact: "react" in all,
      hasNext: "next" in all
    };
  } catch {
    return { hasReact: false, hasNext: false };
  }
}

function detectJsxSyntax(content: string): boolean {
  // Looks for JSX return values or JSX elements
  return /<[A-Z][A-Za-z0-9.]*[\s/>]/.test(content) || /<[a-z][a-z0-9.-]*\s/.test(content.slice(0, 8000));
}

function detectReactImport(content: string): boolean {
  return (
    /\bfrom\s+["']react["']/.test(content) ||
    /require\s*\(\s*["']react["']\s*\)/.test(content) ||
    /\bReact\./.test(content)
  );
}

function detectNextImport(content: string): boolean {
  return /\bfrom\s+["']next\//.test(content) || /require\s*\(\s*["']next\//.test(content);
}

/**
 * Resolve the best entrypoint candidates from the file set.
 * Returns paths sorted by priority (known entrypoints first, then index files, then others).
 */
function resolveEntryCandidates(paths: string[]): string[] {
  const normalized = paths.map((p) => p.replace(/\\/g, "/").replace(/^\.?\//, ""));

  // 1. Known entrypoints exact match
  const exact: string[] = [];
  for (const known of KNOWN_ENTRYPOINTS) {
    const match = normalized.find((p) => p === known || p.endsWith(`/${known}`));
    if (match) exact.push(match);
  }

  // 2. Files with 'index' or 'main' in the basename
  const indexLike = normalized.filter(
    (p) => !exact.includes(p) && /\b(index|main|app)\.[jt]sx?$/i.test(p)
  );

  // 3. Remaining HTML files
  const html = normalized.filter(
    (p) => !exact.includes(p) && !indexLike.includes(p) && (p.endsWith(".html") || p.endsWith(".htm"))
  );

  return [...new Set([...exact, ...indexLike, ...html])];
}

/**
 * Main deterministic classifier.
 */
export function classifyFrontendPreviewCapability(
  sources: ClassifiableSourceFile[]
): FrontendPreviewCapability {
  const paths = sources.map((s) => s.path.replace(/\\/g, "/").replace(/^\.?\//, ""));
  const fileCount = sources.length;

  const hasHtml = paths.some((p) => p.endsWith(".html") || p.endsWith(".htm"));
  const hasTsx = paths.some((p) => p.endsWith(".tsx"));
  const hasJsx = paths.some((p) => p.endsWith(".jsx"));
  const hasTs = paths.some((p) => p.endsWith(".ts") && !p.endsWith(".d.ts") && !p.endsWith(".tsx"));
  const hasJs = paths.some((p) => /\.[mc]?js$/.test(p) && !p.endsWith(".jsx"));
  const hasCss = paths.some((p) => p.endsWith(".css"));
  const hasPackageJson = paths.some((p) => baseName(p) === "package.json");
  const isMultiFile = fileCount > 1;

  let hasNextDep = false;
  let hasReactDep = false;
  let detectedFramework: string | null = null;

  const pkgFile = sources.find((s) => baseName(s.path) === "package.json");
  if (pkgFile) {
    const deps = parsePackageJsonDeps(pkgFile.content);
    hasNextDep = deps.hasNext;
    hasReactDep = deps.hasReact;
    if (hasNextDep) detectedFramework = "Next.js";
    else if (hasReactDep) detectedFramework = "React";
  }

  // Scan source files for signals (limit scan to first 12KB per file for performance)
  let hasJsxSyntax = false;
  let hasReactImport = false;
  let hasNextImport = false;
  let hasNextPathPattern = false;

  for (const s of sources) {
    const snippet = s.content.slice(0, 12_000);
    const p = s.path.replace(/\\/g, "/").replace(/^\.?\//, "");

    if (!hasReactImport && detectReactImport(snippet)) hasReactImport = true;
    if (!hasNextImport && detectNextImport(snippet)) hasNextImport = true;
    if (!hasJsxSyntax && detectJsxSyntax(snippet)) hasJsxSyntax = true;
    if (!hasNextPathPattern && NEXT_PAGE_PATH_RE.test(p)) hasNextPathPattern = true;
  }

  if (!detectedFramework) {
    if (hasNextImport || hasNextPathPattern) detectedFramework = "Next.js (import/path heuristic)";
    else if (hasTsx || hasJsx || hasReactImport) detectedFramework = "React (heuristic)";
    else if (hasTs) detectedFramework = "TypeScript";
    else if (hasJs) detectedFramework = "JavaScript";
    else if (hasHtml) detectedFramework = "HTML";
  }

  const signals = {
    hasHtml,
    hasTsx,
    hasJsx,
    hasTs,
    hasJs,
    hasCss,
    hasPackageJson,
    hasNextDep,
    hasReactDep,
    hasNextPathPattern,
    hasNextImport,
    hasReactImport,
    hasJsxSyntax,
    isMultiFile,
    fileCount,
    detectedFramework
  };

  const entryCandidates = resolveEntryCandidates(paths);
  const primaryEntry = entryCandidates[0] ?? null;

  // ── Classification logic ─────────────────────────────────────────────────

  // CSS-only
  if (hasCss && !hasHtml && !hasTsx && !hasJsx && !hasTs && !hasJs) {
    return {
      previewClass: "css_asset_only",
      previewable: false,
      supportLevel: "unsupported",
      entryCandidates,
      primaryEntry,
      requiredFiles: paths,
      unsupportedReason: "CSS-only upload cannot be rendered without an HTML document.",
      signals
    };
  }

  // Single standalone HTML
  if (!isMultiFile && hasHtml && !hasTsx && !hasJsx) {
    return {
      previewClass: "static_html_document",
      previewable: true,
      supportLevel: "direct",
      entryCandidates,
      primaryEntry,
      requiredFiles: paths,
      unsupportedReason: null,
      signals
    };
  }

  // HTML + CSS + JS bundle (multi-file with HTML as root)
  if (isMultiFile && hasHtml) {
    return {
      previewClass: "html_css_js_bundle",
      previewable: true,
      supportLevel: "bundle",
      entryCandidates,
      primaryEntry: entryCandidates.find((p) => p.endsWith(".html") || p.endsWith(".htm")) ?? primaryEntry,
      requiredFiles: paths,
      unsupportedReason: null,
      signals
    };
  }

  // Next.js-specific candidates (import or path pattern)
  if (hasNextImport || hasNextPathPattern || hasNextDep) {
    // Next.js server-specific features we cannot render
    const hasServerOnlyImports = sources.some((s) =>
      /\bfrom\s+["'](next\/server|next\/headers|next\/cache|next\/navigation)["']/.test(s.content.slice(0, 8000))
    );
    if (hasServerOnlyImports) {
      return {
        previewClass: "next_route_candidate",
        previewable: false,
        supportLevel: "unsupported",
        entryCandidates,
        primaryEntry,
        requiredFiles: paths,
        unsupportedReason:
          "This file uses Next.js server-only APIs (next/server, next/headers, etc.) that cannot run in a browser sandbox. Classify as next_specific_unsupported.",
        signals
      };
    }

    // Page-like TSX that we can preview as a React page in a controlled harness
    const hasTsxOrJsx = hasTsx || hasJsx;
    if (hasTsxOrJsx && primaryEntry) {
      return {
        previewClass: "next_route_candidate",
        previewable: true,
        supportLevel: "transpile",
        entryCandidates,
        primaryEntry,
        requiredFiles: paths,
        unsupportedReason: null,
        signals
      };
    }

    return {
      previewClass: "next_route_candidate",
      previewable: false,
      supportLevel: "unsupported",
      entryCandidates,
      primaryEntry,
      requiredFiles: paths,
      unsupportedReason: "Next.js route without a TSX/JSX entrypoint cannot be previewed in the browser sandbox.",
      signals
    };
  }

  // React component (TSX/JSX with React import or JSX syntax)
  if (hasTsx || hasJsx) {
    if (!primaryEntry) {
      return {
        previewClass: "react_component",
        previewable: false,
        supportLevel: "unsupported",
        entryCandidates,
        primaryEntry,
        requiredFiles: paths,
        unsupportedReason: "React TSX/JSX source has no detectable entrypoint. Cannot mount for preview.",
        signals
      };
    }

    // Determine if this looks like a full page or a component
    const entryContent = sources.find((s) => {
      const p = s.path.replace(/\\/g, "/").replace(/^\.?\//, "");
      return p === primaryEntry;
    })?.content ?? "";

    const isPageLike =
      /\b(createRoot|render\s*\(|ReactDOM\.render)\b/.test(entryContent) ||
      /document\.(getElementById|querySelector)\s*\(/.test(entryContent) ||
      primaryEntry.toLowerCase().includes("page") ||
      primaryEntry.toLowerCase().includes("main");

    const previewClass: FrontendPreviewClass = isPageLike ? "react_page" : "react_component";

    return {
      previewClass,
      previewable: true,
      supportLevel: isMultiFile ? "bundle" : "transpile",
      entryCandidates,
      primaryEntry,
      requiredFiles: paths,
      unsupportedReason: null,
      signals
    };
  }

  // TypeScript (no JSX)
  if (hasTs) {
    // Check if it has DOM-related code
    const hasDomCode = sources.some((s) =>
      /\bdocument\.|window\.|addEventListener\s*\(/.test(s.content.slice(0, 8000))
    );
    if (hasDomCode && primaryEntry) {
      return {
        previewClass: "typescript_dom_app",
        previewable: true,
        supportLevel: isMultiFile ? "bundle" : "transpile",
        entryCandidates,
        primaryEntry,
        requiredFiles: paths,
        unsupportedReason: null,
        signals
      };
    }
    return {
      previewClass: "utility_module",
      previewable: false,
      supportLevel: "unsupported",
      entryCandidates,
      primaryEntry,
      requiredFiles: paths,
      unsupportedReason: "TypeScript utility module — not directly renderable. No DOM entry detected.",
      signals
    };
  }

  // JavaScript
  if (hasJs) {
    const hasDomCode = sources.some((s) =>
      /\bdocument\.|window\.|addEventListener\s*\(|DOMContentLoaded/.test(s.content.slice(0, 8000))
    );
    if (hasDomCode && primaryEntry) {
      return {
        previewClass: "javascript_dom_app",
        previewable: true,
        supportLevel: isMultiFile ? "bundle" : "transpile",
        entryCandidates,
        primaryEntry,
        requiredFiles: paths,
        unsupportedReason: null,
        signals
      };
    }
    return {
      previewClass: "utility_module",
      previewable: false,
      supportLevel: "unsupported",
      entryCandidates,
      primaryEntry,
      requiredFiles: paths,
      unsupportedReason: "JavaScript module without DOM entry — not directly renderable as a UI preview.",
      signals
    };
  }

  return {
    previewClass: "non_renderable_frontend_source",
    previewable: false,
    supportLevel: "unsupported",
    entryCandidates,
    primaryEntry,
    requiredFiles: paths,
    unsupportedReason: "No renderable frontend source files detected.",
    signals
  };
}
