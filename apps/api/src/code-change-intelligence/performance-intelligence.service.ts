import { Injectable, Logger } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import type { PerformanceIntelResult, PerformanceIssue } from "./malv-intelligence.types";

const MAX_FILES = 48;
const MAX_ISSUES = 60;

function pid(file: string, k: string, n: number): string {
  return crypto.createHash("sha1").update(`${file}:${k}:${n}`).digest("hex").slice(0, 12);
}

@Injectable()
export class PerformanceIntelligenceService {
  private readonly logger = new Logger(PerformanceIntelligenceService.name);

  analyze(repoRoot: string, relPaths: string[]): PerformanceIntelResult {
    const issues: PerformanceIssue[] = [];
    const normalized = relPaths
      .map((p) => p.replace(/\\/g, "/"))
      .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes("node_modules/"))
      .slice(0, MAX_FILES);

    let scanned = 0;
    let n = 0;
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
      const isTsx = rel.endsWith(".tsx");

      // Sequential await in for-loop (N+1 style)
      if (/\bfor\s*\([^)]*\)\s*\{[^}]{0,800}\bawait\b/.test(content)) {
        issues.push({
          id: pid(rel, "loop", n++),
          kind: "sequential_await_in_loop",
          severity: "medium",
          file: rel,
          message: "`await` inside `for` loop may serialize async work — consider batching or `Promise.all` where safe.",
          suggestion: "Batch independent IO; keep sequential awaits only when order-dependent."
        });
      }

      // TypeORM / query hints
      if (/createQueryBuilder|getRepository|\.find\s*\(/.test(content) && /\.forEach\s*\(\s*async/.test(content)) {
        issues.push({
          id: pid(rel, "q", n++),
          kind: "suspicious_query_pattern",
          severity: "medium",
          file: rel,
          message: "Async iteration over query results — risk of N+1 queries.",
          suggestion: "Use joins, `In()`, or batched loads."
        });
      }

      // JSON.parse in component body (rough)
      if (isTsx && /return\s*\([^)]*JSON\.parse/.test(content)) {
        issues.push({
          id: pid(rel, "json", n++),
          kind: "heavy_sync_in_render",
          severity: "medium",
          file: rel,
          message: "`JSON.parse` near render path — can block main thread on large payloads.",
          suggestion: "Parse once in state/effect or server; memoize result."
        });
      }

      if (issues.length >= MAX_ISSUES) break;
    }

    const summary =
      scanned === 0
        ? "Performance scan: no files in scope."
        : `Performance scan: ${scanned} file(s), ${issues.length} hint(s). Profile in production for truth.`;

    this.logger.debug(summary);
    return { scannedFiles: scanned, issues, summary };
  }
}
