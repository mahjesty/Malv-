import { Injectable, Logger } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { MALV_PRODUCT_DESIGN_PROFILE } from "./product-design-profile";
import { resolveFrontendScanRoots, walkSourceFiles } from "./frontend-repo-paths";

export type FrontendDesignAuditResult = {
  profileVersion: string;
  scannedFileCount: number;
  librariesDetected: string[];
  tailwindSignals: { classNameUsage: number; commonTokensSample: string[] };
  spacingRhythm: string;
  typographySignals: string[];
  colorTheming: string[];
  darkLightSignals: string[];
  animationLibraries: string[];
  motionConventions: string[];
  responsivenessPatterns: string[];
  repeatedPatterns: string[];
  designDebtAreas: string[];
  polishOpportunities: string[];
  summary: string;
};

@Injectable()
export class FrontendDesignAuditService {
  private readonly logger = new Logger(FrontendDesignAuditService.name);
  private cache: { root: string; at: number; result: FrontendDesignAuditResult } | null = null;
  private readonly ttlMs = 180_000;
  private readonly maxFiles = 400;

  invalidateCache(): void {
    this.cache = null;
  }

  audit(repoRoot: string): FrontendDesignAuditResult {
    const now = Date.now();
    if (this.cache && this.cache.root === repoRoot && now - this.cache.at < this.ttlMs) {
      return this.cache.result;
    }
    const roots = resolveFrontendScanRoots(repoRoot);
    const files = walkSourceFiles(roots, this.maxFiles, [".tsx", ".css"]);

    let classNameHits = 0;
    const tokenSet = new Map<string, number>();
    const libs = new Set<string>();
    let darkHints = 0;
    let lightHints = 0;
    let framer = 0;
    let twMerge = 0;
    const typography = new Set<string>();
    const theming = new Set<string>();
    const responsive = new Set<string>();
    let genericLayouts = 0;

    for (const f of files) {
      let content: string;
      try {
        content = fs.readFileSync(f, "utf8");
      } catch {
        continue;
      }
      const matches = content.match(/className\s*=\s*["'{`]/g);
      classNameHits += matches?.length ?? 0;
      const tw = content.match(/\b(?:flex|grid|gap|p|px|py|m|mx|my)-(?:\d|\[)/g);
      if (tw) {
        for (const t of tw.slice(0, 80)) {
          tokenSet.set(t, (tokenSet.get(t) ?? 0) + 1);
        }
      }
      if (/from\s+["']framer-motion["']/.test(content) || /framer-motion/.test(content)) framer++;
      if (/tailwind-merge|twMerge/.test(content)) twMerge++;
      if (/dark:/.test(content)) darkHints++;
      if (/\blight\b|bg-white|text-black/.test(content)) lightHints++;
      if (/text-(xs|sm|base|lg|xl|2xl|3xl)/.test(content)) typography.add("tailwind scale typography");
      if (/shadow|rounded|ring|backdrop-blur/.test(content)) theming.add("depth + radius + shadow language");
      if (/(sm:|md:|lg:|xl:)/.test(content)) responsive.add("breakpoint-driven layout");
      if (/grid\s+cols-1\s+md:grid-cols/.test(content)) responsive.add("responsive grid collapse");
      if (/flex\s+flex-col\s+gap-4\s+max-w/.test(content)) genericLayouts++;
    }

    const commonTokensSample = [...tokenSet.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([k]) => k);

    const librariesDetected = [...libs];
    if (framer) librariesDetected.push("framer-motion");
    if (twMerge) librariesDetected.push("tailwind-merge");

    const librariesDetectedDedup = Array.from(new Set(librariesDetected)).sort();

    const darkLightSignals: string[] = [];
    if (darkHints) darkLightSignals.push(`dark: variant usage observed in ~${darkHints} file(s) (heuristic)`);
    if (lightHints) darkLightSignals.push("light-surface tokens present (white/black backgrounds)");
    if (!darkHints && lightHints) darkLightSignals.push("consider explicit dark-mode parity for premium feel");

    const motionConventions: string[] = [];
    if (framer) motionConventions.push("Framer Motion present — prefer short springs, layout transitions only where needed");
    else motionConventions.push("No Framer Motion in sample — rely on CSS transitions or add motion sparingly");

    const designDebtAreas: string[] = [];
    if (genericLayouts > 15) designDebtAreas.push("Repeated flex-col + gap + max-w patterns — risk of generic landing layout feel");
    if (classNameHits > 0 && commonTokensSample.length < 4) designDebtAreas.push("Sparse Tailwind token variety — hierarchy may be weak");

    const polishOpportunities: string[] = [
      "Increase typographic contrast between primary narrative and supporting copy.",
      "Add micro-interactions on primary actions (hover/focus) without slowing perceived performance.",
      "Audit empty/loading/error states for the touched routes."
    ];

    const result: FrontendDesignAuditResult = {
      profileVersion: MALV_PRODUCT_DESIGN_PROFILE.name,
      scannedFileCount: files.length,
      librariesDetected: librariesDetectedDedup,
      tailwindSignals: {
        classNameUsage: classNameHits,
        commonTokensSample
      },
      spacingRhythm: "Infer from Tailwind gap/padding tokens — prefer consistent 4/8/12 spacing ladder.",
      typographySignals: [...typography],
      colorTheming: [...theming],
      darkLightSignals,
      animationLibraries: librariesDetectedDedup.filter((l) => l.includes("motion") || l.includes("framer")),
      motionConventions,
      responsivenessPatterns: [...responsive],
      repeatedPatterns: [
        `Generic layout heuristic: ${genericLayouts} files match common flex/grid starter pattern (high-level)`,
        "Prefer distinctive sectioning, typographic hierarchy, and motion restraint to avoid AI-template feel."
      ],
      designDebtAreas,
      polishOpportunities,
      summary: `Design audit: scanned ${files.length} file(s) under ${roots.map((r) => path.relative(repoRoot, r)).join(", ") || "frontend roots"}; Tailwind class usage ~${classNameHits} hits; libraries: ${librariesDetectedDedup.join(", ") || "none detected"}.`
    };

    this.cache = { root: repoRoot, at: now, result };
    this.logger.debug(`Frontend design audit: ${result.summary}`);
    return result;
  }
}
