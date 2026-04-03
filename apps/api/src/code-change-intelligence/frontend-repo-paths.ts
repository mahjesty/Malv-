import * as fs from "fs";
import * as path from "path";

const SKIP = new Set(["node_modules", "dist", ".next", "build", ".git"]);

/** Repo-relative prefixes for any MALV frontend app. */
export const FRONTEND_PATH_MARKERS = ["apps/web/", "apps/malv-frontend/"] as const;

export function isFrontendRepoPath(rel: string): boolean {
  const n = rel.replace(/\\/g, "/");
  return FRONTEND_PATH_MARKERS.some((m) => n.includes(m));
}

/**
 * Absolute directories to scan for TSX/CSS (in priority order).
 */
export function resolveFrontendScanRoots(repoRoot: string): string[] {
  const candidates = [
    path.join(repoRoot, "apps", "web", "src"),
    path.join(repoRoot, "apps", "malv-frontend"),
    path.join(repoRoot, "apps", "malv-frontend", "src")
  ];
  return candidates.filter((p) => fs.existsSync(p) && fs.statSync(p).isDirectory());
}

export function walkSourceFiles(
  roots: string[],
  maxFiles: number,
  exts: readonly string[] = [".tsx", ".css"]
): string[] {
  const out: string[] = [];
  for (const root of roots) {
    walkDir(root, maxFiles, out, exts);
    if (out.length >= maxFiles) break;
  }
  return out;
}

function walkDir(dir: string, maxFiles: number, out: string[], exts: readonly string[]): void {
  if (out.length >= maxFiles) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (out.length >= maxFiles) return;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP.has(e.name)) continue;
      walkDir(full, maxFiles, out, exts);
    } else if (e.isFile() && exts.some((ext) => e.name.endsWith(ext))) {
      out.push(full);
    }
  }
}
