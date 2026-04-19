/**
 * Deterministic static policy review for source intake uploads.
 * No LLM, no runtime execution — pattern rules only.
 */
import AdmZip from "adm-zip";
import { classifyFrontendPreviewCapability } from "../build-units/frontend-preview-classifier.util";
import type { SourceIntakeAuditDecision, SourceIntakeSessionStatus } from "../db/entities/source-intake-session.entity";

export const INTAKE_SCANNER_VERSION = "malv-intake-audit/1.0";

export const INTAKE_AUDIT_DISCLAIMER =
  "Heuristic static policy review only. This is not malware detection and may miss, misclassify, or misjudge risk. " +
  "Verdicts reflect pattern rules, not runtime behavior or intent.";

export type IntakeFindingSeverity = "info" | "warning" | "critical";

export type IntakeAuditFinding = {
  code: string;
  severity: IntakeFindingSeverity;
  path: string;
  line: number | null;
  message: string;
};

export type IntakeChecklistState = "pass" | "warn" | "fail";

export type IntakeChecklistEntry = {
  state: IntakeChecklistState;
  detail: string;
};

export type IntakeAuditChecklist = {
  filesystem: IntakeChecklistEntry;
  network: IntakeChecklistEntry;
  eval: IntakeChecklistEntry;
  scripts: IntakeChecklistEntry;
};

const MAX_ZIP_FILES = 220;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_TOTAL_SCAN_BYTES = 3 * 1024 * 1024;

const SCANNABLE_EXT = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "json",
  "md",
  "txt",
  "html",
  "htm",
  "css",
  "yaml",
  "yml",
  "sh",
  "bash",
  "env",
  "toml",
  "vue",
  "svelte"
]);

const SKIP_PATH_PREFIXES = [
  "node_modules/",
  ".git/",
  "dist/",
  "build/",
  ".next/",
  "coverage/",
  "__pycache__/",
  ".venv/",
  "vendor/"
];

function looksLikeZip(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function safeZipPath(name: string): string | null {
  const n = name.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!n || n.includes("..")) return null;
  const lower = n.toLowerCase();
  for (const p of SKIP_PATH_PREFIXES) {
    if (lower.startsWith(p) || lower.includes(`/${p}`)) return null;
  }
  return n;
}

function extOf(path: string): string {
  const i = path.lastIndexOf(".");
  if (i < 0) return "";
  return path.slice(i + 1).toLowerCase();
}

export type ExtractedSourceFile = { path: string; content: string };

/**
 * Extract text sources from a single file buffer or a ZIP archive.
 */
export function extractIntakeSourceFiles(buffer: Buffer, originalName: string): {
  sources: ExtractedSourceFile[];
  zipFileCount: number;
  scanTruncated: boolean;
  error?: string;
} {
  const baseName = (originalName || "upload").split(/[/\\]/).pop() || "upload";

  if (!looksLikeZip(buffer)) {
    const content = buffer.toString("utf8");
    return {
      sources: [{ path: baseName, content }],
      zipFileCount: 1,
      scanTruncated: false
    };
  }

  try {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    const sources: ExtractedSourceFile[] = [];
    let totalBytes = 0;
    let scanTruncated = false;
    let zipFileCount = 0;

    for (const entry of entries) {
      if (sources.length >= MAX_ZIP_FILES) {
        scanTruncated = true;
        break;
      }
      if (entry.isDirectory) continue;
      const name = safeZipPath(entry.entryName);
      if (!name) continue;
      const ext = extOf(name);
      if (!SCANNABLE_EXT.has(ext)) continue;
      zipFileCount++;
      const raw = entry.getData();
      if (raw.length > MAX_FILE_BYTES) {
        scanTruncated = true;
        continue;
      }
      if (totalBytes + raw.length > MAX_TOTAL_SCAN_BYTES) {
        scanTruncated = true;
        break;
      }
      let content: string;
      try {
        content = raw.toString("utf8");
      } catch {
        continue;
      }
      if (content.includes("\0")) continue;
      totalBytes += content.length;
      sources.push({ path: name, content });
    }

    if (sources.length === 0) {
      return {
        sources: [],
        zipFileCount,
        scanTruncated: true,
        error: "No scannable text files were found in the archive (or limits were exceeded)."
      };
    }

    return { sources, zipFileCount, scanTruncated };
  } catch {
    return {
      sources: [],
      zipFileCount: 0,
      scanTruncated: true,
      error: "Could not read archive bytes as a ZIP."
    };
  }
}

function parsePackageJson(content: string): Record<string, unknown> | null {
  try {
    const o = JSON.parse(content) as unknown;
    return o !== null && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Filename + shallow content heuristics only (no model). Drives honest subtype labels in Explore/detail.
 */
function inferDeterministicArtifactProfile(sources: ExtractedSourceFile[]): {
  deterministicArtifactKind: string;
  deterministicArtifactLabel: string;
} {
  if (sources.length === 0) {
    return {
      deterministicArtifactKind: "other_text",
      deterministicArtifactLabel: "Text source (empty scan)"
    };
  }
  if (sources.length > 1) {
    return {
      deterministicArtifactKind: "multi_file_archive",
      deterministicArtifactLabel: "Multi-file source tree (archive)"
    };
  }

  const s = sources[0]!;
  const path = s.path.replace(/\\/g, "/");
  const ext = extOf(path);

  if (ext === "html" || ext === "htm") {
    return {
      deterministicArtifactKind: "html_document",
      deterministicArtifactLabel: "HTML page / document"
    };
  }
  if (ext === "css") {
    return { deterministicArtifactKind: "css_stylesheet", deterministicArtifactLabel: "CSS stylesheet" };
  }
  if (ext === "json") {
    return { deterministicArtifactKind: "json_document", deterministicArtifactLabel: "JSON file" };
  }
  if (ext === "md" || ext === "mdx") {
    return { deterministicArtifactKind: "markdown_document", deterministicArtifactLabel: "Markdown document" };
  }

  const head = s.content.slice(0, 12_000);
  const headLower = head.toLowerCase();
  const hasNextImport = /\bfrom\s+["']next\//.test(head) || /require\s*\(\s*['"]next\//.test(head);
  const nextPathHint =
    /(^|\/)app\/[^/]+\/(page|layout|loading|error|not-found|route)\.(tsx|jsx|ts|js)$/i.test(path) ||
    /(^|\/)pages\/[^/]+\.(tsx|jsx)$/i.test(path) ||
    /(^|\/)(page|layout)\.(tsx|jsx)$/i.test(path);

  if ((ext === "tsx" || ext === "jsx") && (hasNextImport || nextPathHint)) {
    return {
      deterministicArtifactKind: "next_route_candidate",
      deterministicArtifactLabel: "Next.js-style page/module (import/path heuristics)"
    };
  }

  if (ext === "tsx") {
    const reactHook =
      /\bfrom\s+["']react["']/.test(headLower) ||
      /require\s*\(\s*["']react["']\s*\)/.test(headLower) ||
      /\bReact\./.test(head);
    if (reactHook || /<[A-Za-z][A-Za-z0-9]*/.test(head)) {
      return {
        deterministicArtifactKind: "typescript_react_component",
        deterministicArtifactLabel: "React TSX component / module"
      };
    }
    return {
      deterministicArtifactKind: "typescript_react_component",
      deterministicArtifactLabel: "TSX module (React not detected in scanned prefix)"
    };
  }

  if (ext === "jsx") {
    return {
      deterministicArtifactKind: "javascript_react_component",
      deterministicArtifactLabel: "React JSX component / module"
    };
  }

  if (ext === "ts") {
    const reactish =
      /\bfrom\s+["']react["']/.test(headLower) ||
      /require\s*\(\s*["']react["']\s*\)/.test(headLower);
    if (reactish) {
      return {
        deterministicArtifactKind: "typescript_react_component",
        deterministicArtifactLabel: "TypeScript module using React"
      };
    }
    return {
      deterministicArtifactKind: "typescript_module",
      deterministicArtifactLabel: "TypeScript utility / module"
    };
  }

  if (ext === "js" || ext === "mjs" || ext === "cjs") {
    const reactish =
      /\bfrom\s+["']react["']/.test(headLower) ||
      /require\s*\(\s*["']react["']\s*\)/.test(headLower);
    if (reactish) {
      return {
        deterministicArtifactKind: "javascript_react_component",
        deterministicArtifactLabel: "JavaScript module using React"
      };
    }
    return {
      deterministicArtifactKind: "javascript_module",
      deterministicArtifactLabel: "JavaScript module / script"
    };
  }

  return {
    deterministicArtifactKind: "other_text",
    deterministicArtifactLabel: "Text source file"
  };
}

/** Lightweight detection payload for UI (truthful, best-effort). */
export function buildDetectionJson(args: {
  sources: ExtractedSourceFile[];
  zipFileCount: number;
  scanTruncated: boolean;
  originalLabel: string;
}): Record<string, unknown> {
  const pkg = args.sources.find((s) => s.path.endsWith("package.json") || s.path.endsWith("/package.json"));
  let framework: string | null = null;
  let runtime: string | null = null;
  const entrypoints: string[] = [];
  const deps: string[] = [];

  if (pkg) {
    const p = parsePackageJson(pkg.content);
    if (p) {
      const d = p.dependencies;
      const dev = p.devDependencies;
      const all = {
        ...(typeof d === "object" && d ? (d as Record<string, unknown>) : {}),
        ...(typeof dev === "object" && dev ? (dev as Record<string, unknown>) : {})
      };
      const keys = Object.keys(all);
      for (const k of keys.slice(0, 24)) deps.push(k);
      if (all.next) framework = "Next.js (package hint)";
      else if (all.react) framework = "React (package hint)";
      else if (all.vue) framework = "Vue (package hint)";
      else if (all.svelte) framework = "Svelte (package hint)";
      else if (keys.length) framework = "Node / JS project (package.json)";

      const eng = p.engines;
      if (eng && typeof eng === "object" && eng !== null && typeof (eng as { node?: string }).node === "string") {
        runtime = `Node ${(eng as { node: string }).node} (engines)`;
      } else {
        runtime = "Node.js (inferred)";
      }

      for (const k of ["main", "module", "types", "exports"]) {
        const v = p[k];
        if (typeof v === "string" && v.trim()) entrypoints.push(v.trim());
      }
    }
  }

  if (!framework && args.sources.some((s) => s.path.endsWith(".tsx") || s.path.endsWith(".jsx"))) {
    framework = "React/JSX (file extension hint)";
  }

  const artifact = inferDeterministicArtifactProfile(args.sources);

  // Run the frontend preview classifier to get entrypoint + preview class signals
  // This enriches the detection JSON so feasibility checks can use probableEntrypoint
  let frontendPreviewClass: string | null = null;
  let probableEntrypoint: string | null = null;
  let frontendSupportLevel: string | null = null;
  let frontendPreviewable = false;
  let capability: ReturnType<typeof classifyFrontendPreviewCapability> | null = null;
  try {
    capability = classifyFrontendPreviewCapability(args.sources);
    frontendPreviewClass = capability.previewClass;
    frontendSupportLevel = capability.supportLevel;
    frontendPreviewable = capability.previewable;
    probableEntrypoint = capability.primaryEntry;
    if (capability.entryCandidates.length > 0) {
      for (const ep of capability.entryCandidates.slice(0, 12)) {
        if (!entrypoints.includes(ep)) entrypoints.push(ep);
      }
    }
  } catch {
    capability = null;
  }

  // Classifier failure fallback: still surface obvious HTML entrypoints and previewability
  if (!capability && args.sources.length > 0) {
    const htmlPaths = args.sources
      .map((s) => s.path.replace(/\\/g, "/").replace(/^\.?\//, ""))
      .filter((p) => p.endsWith(".html") || p.endsWith(".htm"));
    if (htmlPaths.length > 0) {
      const preferred =
        htmlPaths.find((p) => /(^|\/)index\.html?$/i.test(p)) ??
        htmlPaths.find((p) => p.toLowerCase().endsWith("index.html") || p.toLowerCase().endsWith("index.htm")) ??
        htmlPaths[0]!;
      probableEntrypoint = probableEntrypoint ?? preferred;
      frontendPreviewable = true;
      frontendPreviewClass = frontendPreviewClass ?? (args.sources.length > 1 ? "html_css_js_bundle" : "static_html_document");
      frontendSupportLevel = frontendSupportLevel ?? (args.sources.length > 1 ? "bundle" : "direct");
      for (const ep of htmlPaths.slice(0, 8)) {
        if (!entrypoints.includes(ep)) entrypoints.push(ep);
      }
    }
  }

  if (!framework && capability?.signals?.detectedFramework) {
    framework = capability.signals.detectedFramework;
  }

  if (
    frontendPreviewClass === "static_html_document" ||
    frontendPreviewClass === "html_css_js_bundle" ||
    artifact.deterministicArtifactKind === "html_document"
  ) {
    framework = "static-html";
    // Browser is the execution surface for HTML entrypoints even when package.json also lists Node tooling.
    runtime = "browser";
    frontendPreviewable = true;
  }

  return {
    scannerVersion: INTAKE_SCANNER_VERSION,
    fileCount: args.sources.length,
    archiveEntriesConsidered: args.zipFileCount,
    scanTruncated: args.scanTruncated,
    originalLabel: args.originalLabel,
    framework: framework ?? null,
    runtime: runtime ?? null,
    entrypoints: entrypoints.length ? entrypoints.slice(0, 12) : [],
    probableEntrypoint: probableEntrypoint ?? null,
    frontendPreviewClass: frontendPreviewClass ?? null,
    frontendSupportLevel: frontendSupportLevel ?? null,
    frontendPreviewable,
    probableSurface: artifact.deterministicArtifactKind ?? null,
    dependenciesInferred: deps.slice(0, 20),
    deterministicArtifactKind: artifact.deterministicArtifactKind,
    deterministicArtifactLabel: artifact.deterministicArtifactLabel,
    note:
      "Detection is shallow static inspection only — not a dependency audit, build graph, or runtime probe." +
      (args.scanTruncated ? " Some files were skipped due to size or archive limits." : "")
  };
}

function categoryForCode(code: string): keyof IntakeAuditChecklist {
  if (code.startsWith("FS_")) return "filesystem";
  if (code.startsWith("NET_") || code.startsWith("SEC_")) return "network";
  if (code.startsWith("NPM_")) return "scripts";
  return "eval";
}

function checklistForCategory(
  findings: IntakeAuditFinding[],
  cat: keyof IntakeAuditChecklist
): IntakeChecklistEntry {
  const rel = findings.filter((f) => categoryForCode(f.code) === cat);
  const crit = rel.filter((f) => f.severity === "critical");
  const warn = rel.filter((f) => f.severity === "warning");
  if (crit.length) {
    return {
      state: "fail",
      detail: crit[0]?.message ?? "High-risk patterns matched in this category."
    };
  }
  if (warn.length) {
    return {
      state: "warn",
      detail: warn[0]?.message ?? "Caution patterns matched — review before execution."
    };
  }
  return {
    state: "pass",
    detail: "Static review found no blocked patterns in this category for the current ruleset."
  };
}

export function buildChecklist(findings: IntakeAuditFinding[]): IntakeAuditChecklist {
  return {
    filesystem: checklistForCategory(findings, "filesystem"),
    network: checklistForCategory(findings, "network"),
    eval: checklistForCategory(findings, "eval"),
    scripts: checklistForCategory(findings, "scripts")
  };
}

function dedupeFindings(findings: IntakeAuditFinding[]): IntakeAuditFinding[] {
  const seen = new Set<string>();
  const out: IntakeAuditFinding[] = [];
  for (const f of findings) {
    const k = `${f.code}:${f.path}:${f.line ?? "x"}:${f.message.slice(0, 80)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}

const LINE_RULES: Array<{
  re: RegExp;
  code: string;
  severity: IntakeFindingSeverity;
  message: string;
}> = [
  {
    re: /\brm\s+(-[a-zA-Z]+\s+)+\/(\s|$|['"`])/,
    code: "FS_DESTRUCTIVE_RM",
    severity: "critical",
    message:
      "Destructive filesystem pattern (rm targeting root). Declined under policy — not a malware verdict."
  },
  {
    re: /\brm\s+(-[a-zA-Z]+\s+)+\*/,
    code: "FS_DESTRUCTIVE_RM_GLOB",
    severity: "critical",
    message: "rm with broad glob — high-risk destructive pattern under intake policy v1."
  },
  {
    re: /\brimraf\s*\(\s*[`'"]\/[`'"]/,
    code: "FS_RIMRAF_ROOT",
    severity: "critical",
    message: "Recursive delete utility aimed at filesystem root — high-risk static pattern."
  },
  {
    re: /\bfs\.rm(Sync)?\s*\([^)]*recursive\s*:\s*true[^)]*['"]\/['"]/,
    code: "FS_RM_RECURSIVE_ROOT",
    severity: "critical",
    message: "Recursive fs.rm/fs.rmSync pattern toward root-like path — blocked by policy."
  },
  {
    re: /\beval\s*\(/,
    code: "DYN_EVAL",
    severity: "critical",
    message: "Dynamic eval(...) — blocked as high-risk dynamic execution in intake policy v1."
  },
  {
    re: /\bnew\s+Function\s*\(/,
    code: "DYN_NEW_FUNCTION",
    severity: "critical",
    message: "new Function(...) — dynamic code generation flagged as critical."
  },
  {
    re: /require\s*\(\s*['"]vm['"]\)|from\s+['"]vm['"]/,
    code: "DYN_VM_MODULE",
    severity: "critical",
    message: "Node vm module — sandbox escape risk; blocked at critical severity for intakes."
  },
  {
    re: /\brunIn(New|This)Context\s*\(/,
    code: "DYN_VM_RUN",
    severity: "critical",
    message: "vm runIn*Context — dynamic execution surface flagged as critical."
  },
  {
    re: /\.exec(Sync)?\s*\([^)]*\$\{/,
    code: "CMD_EXEC_INTERPOLATION",
    severity: "critical",
    message: "Shell exec with template interpolation — common command-injection pattern; blocked."
  },
  {
    re: /https?:\/\/(\d{1,3}\.){3}\d{1,3}\b/,
    code: "NET_LITERAL_IP_URL",
    severity: "warning",
    message: "Hardcoded URL with numeric IP — sometimes used for opaque endpoints; review outbound behavior."
  },
  {
    re: /stratum\+tcp:|xmrig|cryptonight|coinhive|monero\s*miner/i,
    code: "BOT_MINER_HINT",
    severity: "critical",
    message: "Miner / pool-like pattern detected — declined under policy (not a full miner scan)."
  },
  {
    re: /Object\.keys\s*\(\s*process\.env\s*\)/,
    code: "SEC_ENV_ENUM",
    severity: "warning",
    message: "process.env enumeration — can indicate credential harvesting patterns; review carefully."
  },
  {
    re: /navigator\.clipboard\.readText|document\.execCommand\s*\(\s*['"]paste['"]/,
    code: "INP_CLIPBOARD_READ",
    severity: "warning",
    message: "Clipboard read API — sensitive in untrusted code; flagged for review."
  },
  {
    re: /addEventListener\s*\(\s*['"]key(down|up|press)['"]/,
    code: "INP_KEY_LISTENER",
    severity: "warning",
    message: "Keyboard event listener — benign in UI, but flagged as a low-confidence sensitive-input hint."
  }
];

function scanFile(path: string, content: string): IntakeAuditFinding[] {
  const findings: IntakeAuditFinding[] = [];
  const lines = content.split(/\r?\n/);
  let envHits = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.includes("process.env")) envHits++;
    for (const rule of LINE_RULES) {
      if (rule.re.test(line)) {
        findings.push({
          code: rule.code,
          severity: rule.severity,
          path,
          line: i + 1,
          message: rule.message
        });
      }
    }
  }
  if (/child_process|node:child_process/.test(content)) {
    findings.push({
      code: "CMD_CHILD_PROCESS",
      severity: "warning",
      path,
      line: null,
      message: "child_process usage detected — review subprocess behavior before trusting this source."
    });
  }
  if (envHits >= 12) {
    findings.push({
      code: "SEC_ENV_HEAVY",
      severity: "warning",
      path,
      line: null,
      message: "High density of process.env references — may indicate broad secret access; review."
    });
  }

  const hexEsc = (content.match(/\\x[0-9a-fA-F]{2}/g) ?? []).length;
  if (hexEsc >= 64) {
    findings.push({
      code: "OBF_HEX_ESCAPES",
      severity: "warning",
      path,
      line: null,
      message: "Many hex escape sequences — possible obfuscation; not proof of malice."
    });
  }

  if (content.length > 6000 && /atob\s*\(/.test(content) && /\beval\s*\(/i.test(content)) {
    findings.push({
      code: "OBF_ATOB_EVAL_PROXIMITY",
      severity: "warning",
      path,
      line: null,
      message: "atob near eval-like patterns — obfuscation heuristic only."
    });
  }

  return findings;
}

function auditPackageJson(path: string, content: string): IntakeAuditFinding[] {
  const pkg = parsePackageJson(content);
  if (!pkg) return [];
  const scripts = pkg.scripts;
  if (!scripts || typeof scripts !== "object" || scripts === null) return [];
  const findings: IntakeAuditFinding[] = [];
  for (const [name, val] of Object.entries(scripts as Record<string, unknown>)) {
    if (typeof val !== "string") continue;
    const n = name.toLowerCase();
    if (!/^(pre|post)?install$|^prepare$|^prepublish/.test(n)) continue;
    const v = val;
    const remoteShell = /curl\s|wget\s|Invoke-WebRequest|\biwr\b|fetch\s*\(\s*['"]http|bash\s+-c|\/bin\/(ba)?sh|powershell/i.test(
      v
    );
    if (remoteShell) {
      findings.push({
        code: "NPM_LIFECYCLE_REMOTE_SHELL",
        severity: "critical",
        path,
        line: null,
        message:
          `Lifecycle script "${name}" references remote fetch or shell execution — high-risk for supply-chain abuse.`
      });
      continue;
    }
    if (v.trim().length > 0) {
      findings.push({
        code: "NPM_LIFECYCLE_PRESENT",
        severity: "warning",
        path,
        line: null,
        message: `Lifecycle script "${name}" present — review install-time behavior.`
      });
    }
  }
  return findings;
}

export function collectAuditFindings(sources: ExtractedSourceFile[]): IntakeAuditFinding[] {
  const all: IntakeAuditFinding[] = [];
  for (const s of sources) {
    const lower = s.path.toLowerCase();
    if (
      lower.endsWith("package-lock.json") ||
      lower.endsWith("yarn.lock") ||
      lower.endsWith("pnpm-lock.yaml") ||
      lower.endsWith("npm-shrinkwrap.json")
    ) {
      continue;
    }
    if (lower.endsWith("package.json")) {
      all.push(...auditPackageJson(s.path, s.content));
      continue;
    }
    if (lower.endsWith(".json")) {
      if (s.content.length < MAX_FILE_BYTES) {
        all.push(...scanFile(s.path, s.content));
      }
      continue;
    }
    all.push(...scanFile(s.path, s.content));
  }
  return dedupeFindings(all);
}

export type IntakeTerminalDecision = {
  status: SourceIntakeSessionStatus;
  auditDecision: SourceIntakeAuditDecision;
  auditSummary: string;
};

/**
 * Map structured findings to session status + audit_decision + one-line summary (truthful wording).
 */
export function decideIntakeTerminal(findings: IntakeAuditFinding[]): IntakeTerminalDecision {
  const blocking = findings.filter((f) => f.severity === "critical" || f.severity === "warning");
  const critical = blocking.filter((f) => f.severity === "critical");
  const warning = blocking.filter((f) => f.severity === "warning");

  if (critical.length > 0) {
    return {
      status: "declined",
      auditDecision: "declined",
      auditSummary:
        "Declined due to high-risk static patterns matched by the current ruleset. " +
        "This is not a malware-free or malware-positive verdict — manual review may still be needed."
    };
  }
  if (warning.length > 0) {
    return {
      status: "approved_with_warnings",
      auditDecision: "approved_with_warnings",
      auditSummary:
        "Approved with warnings: static review flagged behaviors that warrant caution before execution or publishing."
    };
  }
  return {
    status: "approved",
    auditDecision: "approved",
    auditSummary:
      "Static review found no patterns blocked by the current policy set. This does not guarantee safety or correctness."
  };
}

/**
 * Published intakes carry this copy while preview bytes are still async; the preview-build pipeline
 * overwrites `intakePreviewUnavailableReason` with a concrete message on terminal failure.
 */
export const INTAKE_PREVIEW_ASYNC_PENDING_PLACEHOLDER =
  "Live preview is not generated for this intake yet. The pipeline will produce a real preview once sandbox builds are enabled.";

export function previewUnavailableReasonForDecision(decision: SourceIntakeAuditDecision): string {
  if (decision === "declined") {
    return "Preview is not offered for declined intakes under the current policy. Address findings or use a trusted source.";
  }
  return INTAKE_PREVIEW_ASYNC_PENDING_PLACEHOLDER;
}

export type FullStaticIntakeResult = {
  detectionJson: Record<string, unknown>;
  /** Files that were scanned (bounded); used for optional model-review context. */
  extractedSources: ExtractedSourceFile[];
  findings: IntakeAuditFinding[];
  checklist: IntakeAuditChecklist;
  terminal: IntakeTerminalDecision;
  previewUnavailableReason: string;
  auditJsonBase: Record<string, unknown>;
};

export function runStaticIntakeAnalysis(buffer: Buffer, originalName: string): FullStaticIntakeResult {
  const extracted = extractIntakeSourceFiles(buffer, originalName);
  const sources = extracted.sources;
  const detectionJson = buildDetectionJson({
    sources,
    zipFileCount: extracted.zipFileCount,
    scanTruncated: extracted.scanTruncated,
    originalLabel: originalName || "upload"
  });

  if (extracted.error && sources.length === 0) {
    const findings: IntakeAuditFinding[] = [
      {
        code: "SYS_NO_SCANNABLE_FILES",
        severity: "warning",
        path: originalName || "(upload)",
        line: null,
        message: extracted.error
      }
    ];
    const checklist = buildChecklist(findings);
    const terminal = decideIntakeTerminal(findings);
    return {
      detectionJson: { ...detectionJson, extractError: extracted.error },
      extractedSources: sources,
      findings,
      checklist,
      terminal,
      previewUnavailableReason: previewUnavailableReasonForDecision(terminal.auditDecision),
      auditJsonBase: {
        scannerVersion: INTAKE_SCANNER_VERSION,
        disclaimer: INTAKE_AUDIT_DISCLAIMER,
        checklist,
        findings,
        extractError: extracted.error
      }
    };
  }

  const findings = collectAuditFindings(sources);
  const checklist = buildChecklist(findings);
  const terminal = decideIntakeTerminal(findings);
  const previewUnavailableReason = previewUnavailableReasonForDecision(terminal.auditDecision);

  const auditJsonBase: Record<string, unknown> = {
    scannerVersion: INTAKE_SCANNER_VERSION,
    disclaimer: INTAKE_AUDIT_DISCLAIMER,
    checklist,
    findings,
    scanTruncated: extracted.scanTruncated,
    zipFileCount: extracted.zipFileCount
  };

  return {
    detectionJson,
    extractedSources: sources,
    findings,
    checklist,
    terminal,
    previewUnavailableReason,
    auditJsonBase
  };
}
