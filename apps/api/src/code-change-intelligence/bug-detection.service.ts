import { Injectable, Logger } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import type { BugDetectionResult, BugIssue, BugSeverity } from "./malv-intelligence.types";

const MAX_FILES = 48;
const MAX_ISSUES = 80;

function idFor(file: string, cat: string, idx: number): string {
  return crypto.createHash("sha1").update(`${file}:${cat}:${idx}`).digest("hex").slice(0, 12);
}

@Injectable()
export class BugDetectionService {
  private readonly logger = new Logger(BugDetectionService.name);

  /**
   * Heuristic bug signals on TS/TSX sources (scoped paths, repo-relative).
   */
  detect(repoRoot: string, relPaths: string[]): BugDetectionResult {
    const issues: BugIssue[] = [];
    const normalized = relPaths
      .map((p) => p.replace(/\\/g, "/"))
      .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes("node_modules/") && !p.includes("dist/"))
      .slice(0, MAX_FILES);

    let scanned = 0;
    for (const rel of normalized) {
      const abs = path.join(repoRoot, rel);
      let content: string;
      try {
        if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
        content = fs.readFileSync(abs, "utf8");
      } catch {
        continue;
      }
      scanned++;
      this.scanFile(rel, content, issues);
      if (issues.length >= MAX_ISSUES) break;
    }

    const summary =
      scanned === 0
        ? "Bug scan: no readable source files in scope."
        : `Bug scan: ${scanned} file(s), ${issues.length} heuristic issue(s). Not a substitute for tsc/eslint.`;

    this.logger.debug(summary);
    return { scannedFiles: scanned, issues, summary };
  }

  private scanFile(file: string, s: string, issues: BugIssue[]): void {
    let idx = issues.length;

    const push = (category: BugIssue["category"], severity: BugSeverity, message: string, evidence?: string, lineHint?: number) => {
      issues.push({ id: idFor(file, category, idx++), category, severity, file, message, evidence, lineHint });
    };

    // Type looseness
    if (/\bas any\b/.test(s)) push("type_inconsistency", "medium", "Uses `as any` — weakens type safety.", "`as any`");
    if (/:\s*any\b/.test(s) && !/\/\*\s*eslint/.test(s)) push("type_inconsistency", "low", "Explicit `any` type — prefer narrow types.", ": any");
    if (/@ts-ignore\b/.test(s)) push("type_inconsistency", "medium", "`@ts-ignore` suppresses compiler checks — use `@ts-expect-error` with rationale.", "@ts-ignore");
    if (/eval\s*\(/.test(s)) push("unsafe_pattern", "high", "`eval` is unsafe and hard to audit.", "eval(");
    if (/new\s+Function\s*\(/.test(s)) push("unsafe_pattern", "high", "`new Function` is similar risk to eval.", "new Function");
    if (/dangerouslySetInnerHTML/.test(s)) push("unsafe_pattern", "high", "`dangerouslySetInnerHTML` — XSS risk unless sanitized.", "dangerouslySetInnerHTML");

    // Async footguns
    if (/\.forEach\s*\(\s*async/.test(s)) push("risky_async", "medium", "`forEach` does not await async callbacks — use for-of or `Promise.all`.", "forEach(async");
    if (/\bwhile\s*\([^)]+\)\s*\{[^}]*\bawait\b/.test(s)) {
      push("risky_async", "low", "`await` inside while — verify loop termination and error handling.", "while+await");
    }

    // Dead / empty patterns
    if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(s)) push("dead_code", "low", "Empty catch swallows errors — log or rethrow.", "catch {}");
    if (/catch\s*\{\s*\}/.test(s)) push("dead_code", "low", "Empty optional catch — ensure failures are visible.", "catch {}");

    // Duplication: repeated non-trivial lines (same line appears 3+ times)
    const lineCounts = new Map<string, number>();
    for (const line of s.split(/\r?\n/)) {
      const t = line.trim();
      if (t.length < 24 || /^\s*(\/\/|\/\*|\*)/.test(t)) continue;
      lineCounts.set(t, (lineCounts.get(t) ?? 0) + 1);
    }
    for (const [line, n] of lineCounts) {
      if (n >= 3) {
        push("duplicated_logic", "low", `Same line repeated ${n}× — candidate for extraction or helper.`, line.slice(0, 120));
        break;
      }
    }

    const parseCalls = (s.match(/JSON\.parse\s*\(/g) ?? []).length;
    const tryBlocks = (s.match(/\btry\s*\{/g) ?? []).length;
    if (parseCalls >= 4 && tryBlocks === 0) {
      push("unsafe_pattern", "medium", "Many `JSON.parse` calls without `try` — add validation and error handling.", "JSON.parse");
    }
  }
}

