/**
 * Frontend preview builder — server-side esbuild transpilation pipeline.
 *
 * Produces self-contained HTML preview artifacts from uploaded frontend source.
 * Output is a single HTML file with all JS/CSS inlined (no CDN, no external deps).
 *
 * Safety: preview HTML is served in a sandboxed iframe (allow-scripts only).
 * No access to parent window, no storage, no credentials.
 *
 * Supported:
 *   - Standalone HTML → pass-through
 *   - HTML + CSS + JS bundle → inline assets into single HTML
 *   - React TSX/JSX components → esbuild bundle → mount harness HTML
 *   - React pages (with createRoot / ReactDOM.render) → esbuild bundle → HTML
 *   - TS DOM apps → esbuild transpile → wrap in minimal HTML
 *   - JS DOM apps → wrap in minimal HTML (no transform needed)
 *   - Next.js page candidates → treated as React pages
 *
 * Unsupported (returns null with reason):
 *   - CSS-only
 *   - Utility modules (no DOM entry)
 *   - Next.js server-only APIs
 *   - Non-renderable source
 */

import { Injectable, Logger } from "@nestjs/common";
import * as esbuild from "esbuild";
import type { ClassifiableSourceFile, FrontendPreviewCapability } from "./frontend-preview-classifier.util";
import { classifyFrontendPreviewCapability } from "./frontend-preview-classifier.util";

export type FrontendPreviewBuildResult =
  | {
      success: true;
      html: Buffer;
      mimeType: "text/html";
      capability: FrontendPreviewCapability;
      buildDiag: FrontendPreviewBuildDiag;
    }
  | {
      success: false;
      reason: string;
      reasonCode: string;
      capability: FrontendPreviewCapability;
      buildDiag: FrontendPreviewBuildDiag;
    };

export type FrontendPreviewBuildDiag = {
  previewClass: string;
  supportLevel: string;
  primaryEntry: string | null;
  buildSuccess: boolean;
  buildError: string | null;
  snapshotStatus: "pending" | "skipped";
  cacheHit: boolean;
  unsupportedReason: string | null;
  transpileMs: number | null;
  outputBytes: number | null;
};

const PREVIEW_TIMEOUT_MS = 15_000;

// React mount harness: wraps a default-exported React component for preview
function buildReactMountHarness(bundledJs: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${escapeHtml(title)}</title>
<style>
  *,*::before,*::after{box-sizing:border-box}
  body{margin:0;padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fff;color:#111}
  #root{min-height:100px}
</style>
</head>
<body>
<div id="root"></div>
<script type="module">
${bundledJs}
</script>
</body>
</html>`;
}

// Minimal harness for DOM JS/TS apps (no React)
function buildDomAppHarness(bundledJs: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${escapeHtml(title)}</title>
<style>
  *,*::before,*::after{box-sizing:border-box}
  body{margin:0;padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fff;color:#111}
</style>
</head>
<body>
<div id="root"></div>
<script>
${bundledJs}
</script>
</body>
</html>`;
}

// Inline CSS + JS assets into an HTML document for HTML+CSS+JS bundles
function inlineAssetsIntoHtml(
  htmlContent: string,
  sources: ClassifiableSourceFile[]
): string {
  let html = htmlContent;

  // Replace <link rel="stylesheet" href="./file.css"> with inline <style>
  html = html.replace(
    /<link\s[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi,
    (match, href) => {
      const normalized = href.replace(/^\.?\//, "");
      const cssFile = sources.find((s) => {
        const p = s.path.replace(/\\/g, "/").replace(/^\.?\//, "");
        return p === normalized || p.endsWith(`/${normalized}`);
      });
      if (!cssFile) return match;
      return `<style>\n${cssFile.content}\n</style>`;
    }
  );

  // Replace <script src="./file.js"> with inline <script>
  html = html.replace(
    /<script\s[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi,
    (match, src) => {
      const normalized = src.replace(/^\.?\//, "");
      const jsFile = sources.find((s) => {
        const p = s.path.replace(/\\/g, "/").replace(/^\.?\//, "");
        return p === normalized || p.endsWith(`/${normalized}`);
      });
      if (!jsFile) return match;
      return `<script>\n${jsFile.content}\n</script>`;
    }
  );

  return html;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const VIRTUAL_FS_NAMESPACE = "malv-vfs";

/**
 * Builds a virtual file system plugin for esbuild from in-memory sources.
 * This allows bundling without writing files to disk.
 * External packages (react, react-dom, etc.) fall through to normal node_modules resolution.
 */
function buildVirtualFsPlugin(sources: ClassifiableSourceFile[]): esbuild.Plugin {
  // Normalize all paths: strip leading ./  and \
  const fileMap = new Map<string, string>(); // normalized path → content
  const loaderMap = new Map<string, esbuild.Loader>();

  for (const s of sources) {
    const normalized = s.path.replace(/\\/g, "/").replace(/^\.?\//, "");
    fileMap.set(normalized, s.content);

    const p = normalized.toLowerCase();
    let loader: esbuild.Loader = "js";
    if (p.endsWith(".tsx")) loader = "tsx";
    else if (p.endsWith(".ts")) loader = "ts";
    else if (p.endsWith(".jsx")) loader = "jsx";
    else if (p.endsWith(".css")) loader = "css";
    else if (p.endsWith(".json")) loader = "json";
    loaderMap.set(normalized, loader);
  }

  return {
    name: "malv-virtual-fs",
    setup(build) {
      // Entry point: route into our virtual namespace
      build.onResolve({ filter: /.*/, namespace: "file" }, (args) => {
        if (args.kind !== "entry-point") return undefined;
        const p = args.path.replace(/\\/g, "/").replace(/^\.?\//, "");
        if (fileMap.has(p)) {
          return { path: p, namespace: VIRTUAL_FS_NAMESPACE };
        }
        return undefined;
      });

      // Relative imports from within virtual FS
      build.onResolve({ filter: /^\./, namespace: VIRTUAL_FS_NAMESPACE }, (args) => {
        const importerDir = args.importer.replace(/[^/]+$/, "");
        const rawRelative = args.path.replace(/^\.\//, "");
        const base = rawRelative.startsWith("../")
          ? rawRelative
          : `${importerDir}${rawRelative}`;

        const exts = ["", ".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts", "/index.jsx", "/index.js"];
        for (const ex of exts) {
          const candidate = `${base}${ex}`.replace(/^\//, "");
          if (fileMap.has(candidate)) {
            return { path: candidate, namespace: VIRTUAL_FS_NAMESPACE };
          }
        }
        return { errors: [{ text: `Cannot resolve "${args.path}" from "${args.importer}" in virtual FS.` }] };
      });

      build.onLoad({ filter: /.*/, namespace: VIRTUAL_FS_NAMESPACE }, (args) => {
        const content = fileMap.get(args.path);
        if (content === undefined) {
          return { errors: [{ text: `Virtual file not found: ${args.path}` }] };
        }
        return { contents: content, loader: loaderMap.get(args.path) ?? "js" };
      });
    }
  };
}

@Injectable()
export class FrontendPreviewBuilderService {
  private readonly logger = new Logger(FrontendPreviewBuilderService.name);

  async buildPreview(
    sources: ClassifiableSourceFile[],
    title: string
  ): Promise<FrontendPreviewBuildResult> {
    const capability = classifyFrontendPreviewCapability(sources);

    const baseDiag: FrontendPreviewBuildDiag = {
      previewClass: capability.previewClass,
      supportLevel: capability.supportLevel,
      primaryEntry: capability.primaryEntry,
      buildSuccess: false,
      buildError: null,
      snapshotStatus: "pending",
      cacheHit: false,
      unsupportedReason: capability.unsupportedReason,
      transpileMs: null,
      outputBytes: null
    };

    if (!capability.previewable) {
      return {
        success: false,
        reason: capability.unsupportedReason ?? "Source is not previewable.",
        reasonCode: `not_previewable_${capability.previewClass}`,
        capability,
        buildDiag: { ...baseDiag, buildSuccess: false }
      };
    }

    if (!capability.primaryEntry) {
      return {
        success: false,
        reason: "No entrypoint detected for preview build.",
        reasonCode: "no_entrypoint",
        capability,
        buildDiag: { ...baseDiag, buildSuccess: false, buildError: "No entrypoint" }
      };
    }

    try {
      const result = await Promise.race([
        this.runBuild(sources, capability, title),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Preview build timed out")), PREVIEW_TIMEOUT_MS)
        )
      ]);

      return {
        success: true,
        html: result.html,
        mimeType: "text/html",
        capability,
        buildDiag: { ...baseDiag, buildSuccess: true, outputBytes: result.html.length, transpileMs: result.transpileMs, snapshotStatus: "pending" }
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Frontend preview build failed for "${title}" (${capability.previewClass}): ${msg}`);
      return {
        success: false,
        reason: `Preview build failed: ${msg}`,
        reasonCode: "build_failed",
        capability,
        buildDiag: { ...baseDiag, buildSuccess: false, buildError: msg }
      };
    }
  }

  private async runBuild(
    sources: ClassifiableSourceFile[],
    capability: FrontendPreviewCapability,
    title: string
  ): Promise<{ html: Buffer; transpileMs: number }> {
    const { previewClass, supportLevel, primaryEntry } = capability;
    const t0 = Date.now();

    // ── Direct HTML passthrough ──────────────────────────────────────────────
    if (previewClass === "static_html_document" && supportLevel === "direct") {
      const htmlFile = sources.find((s) => {
        const p = s.path.replace(/\\/g, "/").replace(/^\.?\//, "");
        return p.endsWith(".html") || p.endsWith(".htm");
      });
      if (!htmlFile) throw new Error("HTML file not found in source set.");
      return { html: Buffer.from(htmlFile.content, "utf8"), transpileMs: Date.now() - t0 };
    }

    // ── HTML + CSS + JS bundle: inline assets ────────────────────────────────
    if (previewClass === "html_css_js_bundle" && supportLevel === "bundle") {
      const htmlFile = sources.find((s) => {
        const p = s.path.replace(/\\/g, "/").replace(/^\.?\//, "");
        return p.endsWith(".html") || p.endsWith(".htm");
      });
      if (!htmlFile) throw new Error("HTML entrypoint not found in bundle.");
      const inlined = inlineAssetsIntoHtml(htmlFile.content, sources);
      return { html: Buffer.from(inlined, "utf8"), transpileMs: Date.now() - t0 };
    }

    // ── React TSX/JSX (component or page) + Next route candidate ────────────
    if (
      previewClass === "react_component" ||
      previewClass === "react_page" ||
      previewClass === "next_route_candidate"
    ) {
      const bundledJs = await this.esbuildReact(sources, primaryEntry!, title);
      const html = buildReactMountHarness(bundledJs, title);
      return { html: Buffer.from(html, "utf8"), transpileMs: Date.now() - t0 };
    }

    // ── TypeScript / JavaScript DOM app ─────────────────────────────────────
    if (previewClass === "typescript_dom_app" || previewClass === "javascript_dom_app") {
      if (previewClass === "javascript_dom_app" && supportLevel !== "bundle") {
        // Plain JS: no transpilation needed, just wrap
        const jsFile = sources.find((s) => {
          const p = s.path.replace(/\\/g, "/").replace(/^\.?\//, "");
          return p === primaryEntry;
        });
        if (!jsFile) throw new Error("JS entrypoint not found.");
        const html = buildDomAppHarness(jsFile.content, title);
        return { html: Buffer.from(html, "utf8"), transpileMs: Date.now() - t0 };
      }
      // TypeScript or multi-file JS: use esbuild
      const bundledJs = await this.esbuildDomApp(sources, primaryEntry!);
      const html = buildDomAppHarness(bundledJs, title);
      return { html: Buffer.from(html, "utf8"), transpileMs: Date.now() - t0 };
    }

    throw new Error(`Unsupported build path for class "${previewClass}" + level "${supportLevel}"`);
  }

  private async esbuildReact(
    sources: ClassifiableSourceFile[],
    entryPath: string,
    _title: string
  ): Promise<string> {
    const normalizedSources = sources.map((s) => ({
      ...s,
      path: s.path.replace(/\\/g, "/").replace(/^\.?\//, "")
    }));

    // Detect if entry has explicit root mount (createRoot / ReactDOM.render)
    const entryFile = normalizedSources.find((s) => s.path === entryPath);
    const entryContent = entryFile?.content ?? "";
    const hasExplicitMount =
      /\bcreateRoot\s*\(/.test(entryContent) ||
      /ReactDOM\.render\s*\(/.test(entryContent) ||
      /\brender\s*\(</.test(entryContent);

    let allSources = normalizedSources;
    let effectiveEntry = entryPath;

    // Auto-mount harness for component-only files (no explicit mount)
    if (!hasExplicitMount) {
      const mountHarness: ClassifiableSourceFile = {
        path: "__malv_preview_entry__.tsx",
        content: `
import React from 'react';
import { createRoot } from 'react-dom/client';
import _PreviewComponent from './${entryPath}';
const _root = document.getElementById('root');
if (_root) createRoot(_root).render(React.createElement(_PreviewComponent));
`
      };
      allSources = [...normalizedSources, mountHarness];
      effectiveEntry = "__malv_preview_entry__.tsx";
    }

    const result = await esbuild.build({
      entryPoints: [effectiveEntry],
      bundle: true,
      write: false,
      format: "esm",
      target: ["es2020", "chrome90"],
      jsx: "automatic",
      define: {
        "process.env.NODE_ENV": '"production"'
      },
      plugins: [buildVirtualFsPlugin(allSources)],
      logLevel: "silent",
      metafile: false
    });

    if (result.errors.length > 0) {
      const msgs = await esbuild.formatMessages(result.errors, { kind: "error" });
      throw new Error(`esbuild errors:\n${msgs.slice(0, 3).join("\n")}`);
    }

    const out = result.outputFiles[0];
    if (!out) throw new Error("esbuild produced no output.");
    return out.text;
  }

  private async esbuildDomApp(
    sources: ClassifiableSourceFile[],
    entryPath: string
  ): Promise<string> {
    const normalizedSources = sources.map((s) => ({
      ...s,
      path: s.path.replace(/\\/g, "/").replace(/^\.?\//, "")
    }));

    const result = await esbuild.build({
      entryPoints: [entryPath],
      bundle: true,
      write: false,
      format: "iife",
      target: ["es2020", "chrome90"],
      define: {
        "process.env.NODE_ENV": '"production"'
      },
      plugins: [buildVirtualFsPlugin(normalizedSources)],
      logLevel: "silent",
      metafile: false
    });

    if (result.errors.length > 0) {
      const msgs = await esbuild.formatMessages(result.errors, { kind: "error" });
      throw new Error(`esbuild errors:\n${msgs.slice(0, 3).join("\n")}`);
    }

    const out = result.outputFiles[0];
    if (!out) throw new Error("esbuild produced no output.");
    return out.text;
  }
}
