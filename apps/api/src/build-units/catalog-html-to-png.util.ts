/**
 * Optional Playwright rasterization of self-contained HTML into a PNG grid snapshot.
 * Used when MALV_EXPLORE_HTML_GRID_SNAPSHOT is enabled and `playwright` is installed.
 */

function htmlGridSnapshotEnabled(): boolean {
  const v = (process.env.MALV_EXPLORE_HTML_GRID_SNAPSHOT ?? "").toLowerCase().trim();
  return v === "1" || v === "true" || v === "yes";
}

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

/**
 * Renders HTML in a headless Chromium surface and returns a PNG buffer, or null if skipped/failed.
 * Never throws — logs are for operators only.
 */
export async function tryRenderHtmlCatalogSnapshotPng(
  html: string,
  log?: (msg: string) => void
): Promise<Buffer | null> {
  if (!htmlGridSnapshotEnabled()) return null;

  let chromium: typeof import("playwright").chromium | null = null;
  try {
    const pw = await import("playwright");
    chromium = pw.chromium;
  } catch {
    log?.("explore html snapshot: playwright module not available");
    return null;
  }

  let browser: import("playwright").Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: DEFAULT_VIEWPORT.width, height: DEFAULT_VIEWPORT.height }
    });
    await page.setContent(html, { waitUntil: "load", timeout: 20_000 });
    await new Promise((r) => setTimeout(r, 400));
    const buf = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: DEFAULT_VIEWPORT.width, height: DEFAULT_VIEWPORT.height }
    });
    return buf.length > 0 ? buf : null;
  } catch (e) {
    log?.(`explore html snapshot: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
