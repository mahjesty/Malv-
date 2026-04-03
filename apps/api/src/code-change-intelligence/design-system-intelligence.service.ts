import { Injectable, Logger } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import type { DesignSystemProfile } from "./design-system-profile.types";
import { resolveFrontendScanRoots, walkSourceFiles } from "./frontend-repo-paths";

const PROFILE_VERSION = "malv_design_system_v2";

@Injectable()
export class DesignSystemIntelligenceService {
  private readonly logger = new Logger(DesignSystemIntelligenceService.name);
  private cache: { root: string; at: number; result: DesignSystemProfile } | null = null;
  private readonly ttlMs = 180_000;
  private readonly maxFiles = 500;

  invalidateCache(): void {
    this.cache = null;
  }

  /**
   * Scan frontend trees for spacing, type, color, radius/shadow, layout heuristics.
   */
  scan(repoRoot: string): DesignSystemProfile {
    const now = Date.now();
    if (this.cache && this.cache.root === repoRoot && now - this.cache.at < this.ttlMs) {
      return this.cache.result;
    }

    const scanRoots = resolveFrontendScanRoots(repoRoot);
    const files = walkSourceFiles(scanRoots, this.maxFiles, [".tsx", ".css"]);
    const relRoots = scanRoots.map((r) => path.relative(repoRoot, r).replace(/\\/g, "/"));

    if (files.length === 0) {
      const empty = this.emptyProfile(relRoots);
      this.cache = { root: repoRoot, at: now, result: empty };
      return empty;
    }

    const spacingCounts = new Map<number, number>();
    const textSteps = new Map<string, number>();
    const colorSamples = new Map<string, number>();
    const roundedSamples = new Map<string, number>();
    const shadowSamples = new Map<string, number>();
    let flexHits = 0;
    let gridHits = 0;
    let buttonish = 0;
    let cardish = 0;
    let blurGlass = false;
    let framerHits = 0;

    for (const f of files) {
      let content: string;
      try {
        content = fs.readFileSync(f, "utf8");
      } catch {
        continue;
      }

      const twSpacing = content.matchAll(/\b(?:gap|space-[xy]|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr)-(\d{1,2})\b/g);
      for (const m of twSpacing) {
        const n = Number(m[1]);
        if (Number.isFinite(n)) spacingCounts.set(n, (spacingCounts.get(n) ?? 0) + 1);
      }

      for (const m of content.matchAll(/\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl)\b/g)) {
        textSteps.set(m[1], (textSteps.get(m[1]) ?? 0) + 1);
      }

      for (const m of content.matchAll(/\b(?:bg|text|border)-(?:slate|zinc|neutral|stone|gray|primary|secondary|muted|accent|destructive|card|background|foreground)[/-][\w-]+/g)) {
        const key = m[0].slice(0, 48);
        colorSamples.set(key, (colorSamples.get(key) ?? 0) + 1);
      }

      for (const m of content.matchAll(/\brounded(?:-none|-sm|-md|-lg|-xl|-2xl|-3xl|-full)?\b/g)) {
        roundedSamples.set(m[0], (roundedSamples.get(m[0]) ?? 0) + 1);
      }
      for (const m of content.matchAll(/\bshadow(?:-none|-sm|-md|-lg|-xl|-2xl)?\b/g)) {
        shadowSamples.set(m[0], (shadowSamples.get(m[0]) ?? 0) + 1);
      }

      flexHits += (content.match(/\bflex\b/g) ?? []).length;
      gridHits += (content.match(/\bgrid\b/g) ?? []).length;
      if (/\bButton\b|<button\b/.test(content)) buttonish++;
      if (/\bCard\b|rounded-(lg|xl|2xl).+shadow/.test(content)) cardish++;
      if (/backdrop-blur|bg-white\/\d|bg-black\/\d|glass/i.test(content)) blurGlass = true;
      if (/framer-motion|\bfrom\s+["']framer-motion["']/.test(content)) framerHits++;
    }

    const dominantSteps = [...spacingCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k]) => k);

    const textStepsSorted = [...textSteps.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([k]) => k);

    const colorTop = [...colorSamples.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([k]) => k);

    const roundedTop = [...roundedSamples.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k]) => k);
    const shadowTop = [...shadowSamples.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k]) => k);

    const rhythmSummary =
      dominantSteps.length > 0
        ? `Spacing ladder leans on ${dominantSteps.slice(0, 4).join(", ")} — keep section padding on the same rhythm.`
        : "No strong Tailwind spacing sample — default to 4/8/12/16 ladder.";

    const hierarchySummary =
      textStepsSorted.length >= 3
        ? `Typography steps observed: ${textStepsSorted.join(", ")} — preserve distinct display/body/caption tiers.`
        : "Limited text-* variety in sample — strengthen hierarchy with explicit scale steps.";

    const themingSummary =
      colorTop.length > 0
        ? `Semantic color classes cluster around: ${colorTop.slice(0, 4).join("; ")}`
        : "Few semantic color tokens in sample — align new UI with existing theme variables.";

    const radiusShadow: DesignSystemProfile["radiusShadow"] = {
      roundedSamples: roundedTop,
      shadowSamples: shadowTop,
      blurGlassSignals: blurGlass,
      summary:
        (roundedTop.length ? `Radius: ${roundedTop.join(", ")}. ` : "") +
        (shadowTop.length ? `Shadow: ${shadowTop.join(", ")}. ` : "") +
        (blurGlass ? "Backdrop/blur or glass-like signals present — use sparingly for depth accents." : "No strong glass signal — depth should come from hierarchy and spacing first.")
    };

    const labels: string[] = [];
    if (buttonish > 0) labels.push(`Interactive controls in ~${buttonish} file(s)`);
    if (cardish > 0) labels.push(`Card-like surfaces suggested in ~${cardish} file(s)`);
    if (framerHits > 0) labels.push(`framer-motion referenced in ~${framerHits} file(s)`);
    if (flexHits > gridHits * 2) labels.push("Flex-first layout bias");
    else if (gridHits > flexHits * 2) labels.push("Grid-first layout bias");
    else labels.push("Mixed flex/grid layout patterns");

    const result: DesignSystemProfile = {
      profileVersion: PROFILE_VERSION,
      scannedFileCount: files.length,
      scanRoots: relRoots.length ? relRoots : ["(no frontend src found)"],
      spacingScale: {
        dominantSteps,
        rhythmSummary
      },
      typographyScale: {
        textSteps: textStepsSorted,
        hierarchySummary
      },
      colorTokens: {
        samples: colorTop,
        themingSummary
      },
      radiusShadow,
      componentPatterns: { labels },
      layoutStructures: {
        flexHeavy: flexHits >= gridHits,
        gridHeavy: gridHits > flexHits,
        summary: `flex≈${flexHits} grid≈${gridHits} token hits — ${flexHits >= gridHits ? "prefer flex stacks with breakpoint shifts" : "prefer responsive grids where density matters"}.`
      }
    };

    this.cache = { root: repoRoot, at: now, result };
    this.logger.debug(`Design system scan: ${files.length} files, roots=${relRoots.join(",")}`);
    return result;
  }

  private emptyProfile(scanRoots: string[]): DesignSystemProfile {
    return {
      profileVersion: PROFILE_VERSION,
      scannedFileCount: 0,
      scanRoots: scanRoots.length ? scanRoots : ["(no frontend src found)"],
      spacingScale: { dominantSteps: [], rhythmSummary: "No frontend sources found — use mobile-first 4/8/12/16 rhythm." },
      typographyScale: { textSteps: [], hierarchySummary: "No samples — enforce clear H1/section/body/caption steps." },
      colorTokens: { samples: [], themingSummary: "No theme samples — follow product semantic tokens when added." },
      radiusShadow: {
        roundedSamples: [],
        shadowSamples: [],
        blurGlassSignals: false,
        summary: "No radius/shadow data — use subtle elevation, not flat stacks."
      },
      componentPatterns: { labels: ["No components scanned"] },
      layoutStructures: {
        flexHeavy: true,
        gridHeavy: false,
        summary: "Default: single-column mobile flow with md/lg enhancement."
      }
    };
  }
}
