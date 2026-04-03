import { Injectable, Logger } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { isFrontendRepoPath, resolveFrontendScanRoots, walkSourceFiles } from "./frontend-repo-paths";

export type DesignCritiqueIssue = {
  code: string;
  severity: "low" | "medium" | "high";
  note: string;
};

export type FrontendDesignCritiqueDimensions = {
  hierarchy: number;
  spacingRhythm: number;
  visualBalance: number;
  contrastEmphasis: number;
  ctaClarity: number;
  componentConsistency: number;
  themeModeQuality: number;
  mobileComposition: number;
  interaction: number;
  motion: number;
  responsiveness: number;
};

export type FrontendDesignCritiqueResult = {
  designQualityScore: number;
  designCritiqueSummary: string;
  improvementSuggestions: string[];
  issues: DesignCritiqueIssue[];
  dimensions: FrontendDesignCritiqueDimensions;
  filesCritiqued: number;
};

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

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Structured UI critique from layout/class patterns in TSX (no pixel rendering).
 * Design Brain V2: post-implementation analysis (generic patterns, hierarchy, motion, CTA).
 */
@Injectable()
export class DesignCritiqueService {
  private readonly logger = new Logger(DesignCritiqueService.name);

  /**
   * @param touchedRelPaths — repo-relative paths (e.g. `apps/web/src/...`); if empty, samples `apps/web/src` up to cap.
   */
  critique(repoRoot: string, touchedRelPaths: string[]): FrontendDesignCritiqueResult {
    const roots = resolveFrontendScanRoots(repoRoot);
    if (roots.length === 0) {
      return this.emptyResult("No frontend source roots — UI critique skipped.");
    }

    const absPaths: string[] = [];
    const normalized = touchedRelPaths
      .map((p) => p.replace(/\\/g, "/"))
      .filter((p) => isFrontendRepoPath(p) && p.endsWith(".tsx"));

    for (const rel of normalized.slice(0, 24)) {
      const abs = path.isAbsolute(rel) ? rel : path.join(repoRoot, rel);
      if (fs.existsSync(abs) && abs.endsWith(".tsx")) absPaths.push(abs);
    }

    if (absPaths.length === 0) {
      absPaths.push(...walkSourceFiles(roots, 18, [".tsx"]));
    }

    let combined = "";
    let filesRead = 0;
    for (const abs of absPaths) {
      try {
        combined += `\n/* ${path.basename(abs)} */\n` + fs.readFileSync(abs, "utf8");
        filesRead++;
      } catch {
        /* skip */
      }
    }

    if (!combined.trim()) {
      return this.emptyResult("No readable TSX in scope for critique.");
    }

    const d = this.scoreDimensions(combined);
    const { issues, suggestions } = this.detectPatterns(combined, d);

    const structural = (d.hierarchy + d.spacingRhythm + d.visualBalance) / 3;
    const polish = (d.contrastEmphasis + d.ctaClarity + d.componentConsistency) / 3;
    const adaptive = (d.themeModeQuality + d.mobileComposition + d.responsiveness) / 3;
    const ixMotion = (d.interaction + d.motion) / 2;
    let designQualityScore = Math.round(
      clamp(structural * 0.32 + polish * 0.26 + adaptive * 0.25 + ixMotion * 0.17, 0, 100)
    );

    const genericPenalty = issues.filter((i) => i.code.startsWith("generic_") || i.code === "centered_layout_cluster").length;
    designQualityScore = clamp(designQualityScore - genericPenalty * 4, 0, 100);

    const designCritiqueSummary = this.buildSummary(designQualityScore, d, issues, filesRead);

    this.logger.debug(`Design critique: score=${designQualityScore}, files=${filesRead}`);

    return {
      designQualityScore,
      designCritiqueSummary,
      improvementSuggestions: suggestions.slice(0, 12),
      issues,
      dimensions: d,
      filesCritiqued: filesRead
    };
  }

  critiqueFromCwd(touchedRelPaths: string[]): FrontendDesignCritiqueResult {
    return this.critique(findRepoRoot(), touchedRelPaths);
  }

  private emptyResult(note: string): FrontendDesignCritiqueResult {
    const neutral = 50;
    const d = this.neutralDimensions(neutral);
    return {
      designQualityScore: neutral,
      designCritiqueSummary: note,
      improvementSuggestions: ["Add or touch TSX under apps/web or apps/malv-frontend to enable a scoped critique."],
      issues: [{ code: "critique_skipped", severity: "low", note }],
      dimensions: d,
      filesCritiqued: 0
    };
  }

  private neutralDimensions(n: number): FrontendDesignCritiqueDimensions {
    return {
      hierarchy: n,
      spacingRhythm: n,
      visualBalance: n,
      contrastEmphasis: n,
      ctaClarity: n,
      componentConsistency: n,
      themeModeQuality: n,
      mobileComposition: n,
      interaction: n,
      motion: n,
      responsiveness: n
    };
  }

  private scoreDimensions(s: string): FrontendDesignCritiqueDimensions {
    const textSizes = new Set((s.match(/\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl)\b/g) ?? []).map((x) => x.replace("text-", "")));
    const hasHeading = /<h[1-6]\b|text-(3xl|4xl|5xl|6xl)|font-(bold|extrabold|black)/.test(s);
    let hierarchy = 52 + Math.min(28, textSizes.size * 4) + (hasHeading ? 12 : 0);
    if (textSizes.size <= 2 && !hasHeading) hierarchy -= 22;
    hierarchy = clamp(hierarchy, 0, 100);

    const gapTokens = (s.match(/\b(?:gap|space-[xy])-(?:\d|\[)/g) ?? []).length;
    const padTokens = (s.match(/\b[pm][xy]?-(?:\d|\[)/g) ?? []).length;
    const spacingRhythm = clamp(48 + Math.min(30, Math.floor((gapTokens + padTokens) / 8)) - (/\bgap-4\b/g.test(s) && !/\bgap-(2|3|6|8|12)\b/.test(s) ? 12 : 0), 0, 100);

    const flexCenter = (s.match(/\bjustify-center\b/g) ?? []).length;
    const itemsCenter = (s.match(/\bitems-center\b/g) ?? []).length;
    const maxW = (s.match(/\bmax-w-(xl|lg|md|4xl|5xl|6xl|7xl)\b/g) ?? []).length;
    const mxAuto = (s.match(/\bmx-auto\b/g) ?? []).length;
    let visualBalance = 62;
    if (flexCenter + itemsCenter > 12 && maxW + mxAuto > 6) visualBalance -= 25;
    else if (flexCenter + itemsCenter > 6) visualBalance -= 10;
    visualBalance = clamp(visualBalance, 0, 100);

    const contrastEmphasis = clamp(
      55 + (/text-muted-foreground|opacity-|contrast-/.test(s) ? 12 : 0) + (/font-(semibold|bold)|text-primary\b/.test(s) ? 15 : 0),
      0,
      100
    );

    const ctaClarity = clamp(
      55 + (/\b(button|Button)\b/.test(s) ? 10 : 0) + (/primary|variant.*default|bg-primary/.test(s) ? 18 : 0),
      0,
      100
    );

    const rounded = (s.match(/\brounded-(lg|xl|2xl|3xl)\b/g) ?? []).length;
    const shadow = (s.match(/\bshadow-(sm|md|lg|xl)\b/g) ?? []).length;
    let componentConsistency = 58;
    if (rounded > 20 && shadow > 15) componentConsistency -= 18;
    componentConsistency = clamp(componentConsistency, 0, 100);

    const dark = (s.match(/\bdark:/g) ?? []).length;
    const lightSurfaces = (s.match(/\bbg-white\b|\btext-black\b/g) ?? []).length;
    let themeModeQuality = 50 + Math.min(30, dark * 2);
    if (lightSurfaces > 8 && dark < 3) themeModeQuality -= 20;
    themeModeQuality = clamp(themeModeQuality, 0, 100);

    const breakpoints = (s.match(/\b(sm|md|lg|xl|2xl):/g) ?? []).length;
    const mobileComposition = clamp(52 + Math.min(35, Math.floor(breakpoints / 4)) + (/flex-col.*md:flex-row|grid-cols-1.*md:/.test(s) ? 10 : 0), 0, 100);

    const interaction = clamp(
      50 +
        (/\bhover:/g.test(s) ? 14 : 0) +
        (/\bfocus:|focus-visible:/.test(s) ? 12 : 0) +
        (/\bactive:|disabled:/.test(s) ? 8 : 0) +
        (/\btransition|duration-\d/.test(s) ? 10 : 0),
      0,
      100
    );

    const motion = clamp(
      48 + (/framer-motion|\bmotion\./.test(s) ? 18 : 0) + (/\banimate-|@keyframes/.test(s) ? 12 : 0),
      0,
      100
    );

    const responsiveness = clamp(50 + Math.min(40, Math.floor(breakpoints / 3)), 0, 100);

    return {
      hierarchy,
      spacingRhythm,
      visualBalance,
      contrastEmphasis,
      ctaClarity,
      componentConsistency,
      themeModeQuality,
      mobileComposition,
      interaction,
      motion,
      responsiveness
    };
  }

  private detectPatterns(
    s: string,
    d: FrontendDesignCritiqueDimensions
  ): { issues: DesignCritiqueIssue[]; suggestions: string[] } {
    const issues: DesignCritiqueIssue[] = [];
    const suggestions: string[] = [];

    const centeredBlocks = (s.match(/\bjustify-center\b/g) ?? []).length + (s.match(/\bitems-center\b/g) ?? []).length;
    const maxW = (s.match(/\bmax-w-(xl|lg|md|4xl|5xl|6xl|7xl)\b/g) ?? []).length;
    if (centeredBlocks > 14 && maxW > 5) {
      issues.push({
        code: "centered_layout_cluster",
        severity: "medium",
        note: "Heavy use of centered flex + max-width containers — common AI landing template pattern."
      });
      suggestions.push("Break symmetry: alternate left-aligned sections, full-bleed bands, or asymmetric grids.");
    }

    const cardLike = (s.match(/\brounded-(lg|xl|2xl)\b/g) ?? []).length;
    const shadows = (s.match(/\bshadow-(sm|md|lg)\b/g) ?? []).length;
    if (cardLike > 18 && shadows > 12) {
      issues.push({
        code: "generic_card_stack",
        severity: "medium",
        note: "Repeated card-like surfaces (rounded + shadow) reduce visual depth and feel generic."
      });
      suggestions.push("Vary elevation: use borders, flat panels, or typography-led sections instead of more cards.");
    }

    if (d.hierarchy < 45) {
      issues.push({
        code: "weak_hierarchy",
        severity: "high",
        note: "Limited typographic scale / heading signals — hierarchy may read flat."
      });
      suggestions.push("Introduce clear size steps (e.g. display + body + caption) and semantic headings.");
    }

    if (d.spacingRhythm < 42) {
      issues.push({
        code: "spacing_rhythm",
        severity: "medium",
        note: "Spacing tokens look sparse or monotonous — rhythm may feel stiff."
      });
      suggestions.push("Use a consistent spacing ladder (4/8/12/16) and vary section padding vs. inline gaps.");
    }

    if (d.interaction < 40) {
      issues.push({
        code: "missing_interaction_states",
        severity: "medium",
        note: "Few hover/focus/active classes — controls may feel inert."
      });
      suggestions.push("Add hover/focus-visible styles to interactive elements and primary CTAs.");
    }

    if (d.themeModeQuality < 40) {
      issues.push({
        code: "theme_mode_imbalance",
        severity: "low",
        note: "Light surfaces dominate without strong dark: parity — check dark mode quality."
      });
      suggestions.push("Audit dark: tokens for backgrounds, borders, and muted text.");
    }

    if (d.responsiveness < 42) {
      issues.push({
        code: "responsive_gaps",
        severity: "medium",
        note: "Limited breakpoint-driven layout — mobile composition may be fragile."
      });
      suggestions.push("Add sm:/md: layout shifts (stack → row, tighter padding on small screens).");
    }

    if (d.motion < 35 && /framer-motion/.test(s)) {
      suggestions.push("Prefer restrained motion: short durations, respect reduced-motion media query.");
    }

    if (issues.length === 0) {
      suggestions.push("Spot-check contrast ratios on primary text vs. background in both themes.");
      suggestions.push("Validate tap targets (min ~44px) on mobile for primary actions.");
    }

    return { issues, suggestions };
  }

  private buildSummary(score: number, d: FrontendDesignCritiqueDimensions, issues: DesignCritiqueIssue[], files: number): string {
    const tier =
      score >= 72 ? "acceptable for merge with polish pass" : score >= 52 ? "needs improvement before shipping UI" : "high risk of generic or flat UI";
    return `Heuristic UI critique over ${files} TSX file(s): design quality score ${score}/100 (${tier}). Hierarchy ${d.hierarchy}, spacing ${d.spacingRhythm}, interaction ${d.interaction}, motion ${d.motion}, responsiveness ${d.responsiveness}. Flagged ${issues.length} pattern issue(s). Not a substitute for visual QA.`;
  }
}

/** @deprecated Use DesignCritiqueService — alias for backward compatibility. */
export const FrontendDesignCritiqueService = DesignCritiqueService;
