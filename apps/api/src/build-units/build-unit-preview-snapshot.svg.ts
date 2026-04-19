import type { BuildUnitType } from "../db/entities/build-unit.entity";

const SNAPSHOT_W = 800;
const SNAPSHOT_H = 480;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncate(t: string, max: number): string {
  const x = t.trim();
  if (x.length <= max) return x;
  return `${x.slice(0, max - 1)}…`;
}

/**
 * Deterministic SVG used as the persisted Explore grid snapshot when no raster/HTML artifact exists.
 */
export function buildCatalogPreviewSnapshotSvg(args: {
  title: string;
  type: BuildUnitType;
  category: string;
  accent: string;
  subtitle?: string | null;
}): Buffer {
  const title = truncate(escapeXml(args.title || "Unit"), 72);
  const cat = truncate(escapeXml(args.category || "general"), 32);
  const type = escapeXml(args.type || "template");
  const accent = (args.accent || "oklch(0.65 0.14 220)").trim().slice(0, 80);
  const sub = args.subtitle?.trim()
    ? truncate(escapeXml(args.subtitle), 120)
    : null;

  const isWorkflow = args.type === "workflow" || args.type === "plugin";
  const isBlueprint = args.type === "blueprint";
  const isCodeHeavy = args.type === "component" || args.type === "behavior" || args.type === "ai_generated";

  let body = "";
  if (isWorkflow) {
    body = `
      <g opacity="0.92">
        <rect x="56" y="160" rx="10" ry="10" width="140" height="56" fill="none" stroke="url(#g)" stroke-width="2"/>
        <rect x="236" y="160" rx="10" ry="10" width="140" height="56" fill="none" stroke="url(#g)" stroke-width="2"/>
        <rect x="416" y="160" rx="10" ry="10" width="140" height="56" fill="none" stroke="url(#g)" stroke-width="2"/>
        <rect x="596" y="160" rx="10" ry="10" width="140" height="56" fill="none" stroke="url(#g)" stroke-width="2"/>
        <path d="M196 188 L236 188" stroke="url(#g)" stroke-width="2" stroke-linecap="round"/>
        <path d="M376 188 L416 188" stroke="url(#g)" stroke-width="2" stroke-linecap="round"/>
        <path d="M556 188 L596 188" stroke="url(#g)" stroke-width="2" stroke-linecap="round"/>
        <rect x="320" y="280" rx="12" ry="12" width="160" height="72" fill="url(#g2)" opacity="0.35"/>
        <text x="400" y="322" text-anchor="middle" fill="rgba(255,255,255,0.5)" font-family="ui-sans-serif,system-ui,sans-serif" font-size="13" font-weight="600">Flow</text>
      </g>`;
  } else if (isBlueprint) {
    body = `
      <g opacity="0.88">
        <rect x="120" y="140" width="220" height="140" rx="12" fill="none" stroke="url(#g)" stroke-width="2"/>
        <rect x="360" y="120" width="200" height="100" rx="10" fill="url(#g2)" opacity="0.25"/>
        <rect x="380" y="250" width="200" height="90" rx="10" fill="none" stroke="url(#g)" stroke-width="1.5" opacity="0.7"/>
        <rect x="200" y="300" width="160" height="70" rx="8" fill="url(#g2)" opacity="0.2"/>
      </g>`;
  } else if (isCodeHeavy) {
    body = `
      <g opacity="0.9">
        <rect x="72" y="150" width="656" height="220" rx="14" fill="rgba(0,0,0,0.35)" stroke="url(#g)" stroke-width="1.5"/>
        <rect x="92" y="176" width="42%" height="10" rx="4" fill="url(#g2)" opacity="0.5"/>
        <rect x="92" y="202" width="58%" height="10" rx="4" fill="rgba(255,255,255,0.08)"/>
        <rect x="92" y="228" width="48%" height="10" rx="4" fill="rgba(255,255,255,0.06)"/>
        <rect x="92" y="254" width="52%" height="10" rx="4" fill="rgba(255,255,255,0.07)"/>
        <rect x="92" y="300" width="36%" height="10" rx="4" fill="url(#g2)" opacity="0.35"/>
      </g>`;
  } else {
    body = `
      <g opacity="0.92">
        <rect x="96" y="132" width="608" height="268" rx="16" fill="rgba(0,0,0,0.28)" stroke="url(#g)" stroke-width="1.5"/>
        <rect x="120" y="156" width="180" height="14" rx="6" fill="url(#g2)" opacity="0.45"/>
        <rect x="120" y="186" width="520" height="10" rx="4" fill="rgba(255,255,255,0.07)"/>
        <rect x="120" y="208" width="480" height="10" rx="4" fill="rgba(255,255,255,0.06)"/>
        <rect x="120" y="230" width="400" height="10" rx="4" fill="rgba(255,255,255,0.05)"/>
        <rect x="120" y="270" width="260" height="112" rx="12" fill="url(#g2)" opacity="0.22"/>
        <rect x="400" y="270" width="240" height="112" rx="12" fill="rgba(255,255,255,0.04)" stroke="url(#g)" stroke-width="1" opacity="0.5"/>
      </g>`;
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SNAPSHOT_W}" height="${SNAPSHOT_H}" viewBox="0 0 ${SNAPSHOT_W} ${SNAPSHOT_H}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0f1115"/>
      <stop offset="100%" style="stop-color:#1a1d24"/>
    </linearGradient>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${accent};stop-opacity:0.95"/>
      <stop offset="100%" style="stop-color:${accent};stop-opacity:0.35"/>
    </linearGradient>
    <linearGradient id="g2" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${accent};stop-opacity:0.55"/>
      <stop offset="100%" style="stop-color:${accent};stop-opacity:0.12"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  ${body}
  <text x="48" y="64" fill="rgba(255,255,255,0.92)" font-family="ui-sans-serif,system-ui,sans-serif" font-size="26" font-weight="700">${title}</text>
  ${
    sub
      ? `<text x="48" y="96" fill="rgba(255,255,255,0.45)" font-family="ui-sans-serif,system-ui,sans-serif" font-size="14">${sub}</text>`
      : ""
  }
  <text x="48" y="${sub ? 430 : 410}" fill="rgba(255,255,255,0.35)" font-family="ui-sans-serif,system-ui,sans-serif" font-size="12" font-weight="600" letter-spacing="0.12em">${type.toUpperCase()} · ${cat}</text>
</svg>`;

  return Buffer.from(svg, "utf8");
}
