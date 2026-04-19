/** Max bytes for build-unit catalog preview images (PNG/JPEG/WebP). */
export const BUILD_UNIT_PREVIEW_MAX_BYTES = 8 * 1024 * 1024;

/** Max bytes for optional source uploads (code/text). */
export const BUILD_UNIT_SOURCE_MAX_BYTES = 4 * 1024 * 1024;

export const BUILD_UNIT_PREVIEW_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp"
]);

/** HTML artifacts for live preview pipeline (same size cap as images). */
export const BUILD_UNIT_PREVIEW_HTML_MIMES = new Set(["text/html", "application/xhtml+xml"]);

export const BUILD_UNIT_PREVIEW_ALL_MIMES = new Set([...BUILD_UNIT_PREVIEW_MIMES, ...BUILD_UNIT_PREVIEW_HTML_MIMES]);

export const BUILD_UNIT_SOURCE_MIMES = new Set([
  "text/html",
  "text/css",
  "text/javascript",
  "application/javascript",
  "application/typescript",
  "text/plain",
  "application/json",
  "application/x-typescript", // some clients
  "text/tsx" // rare
]);

export const BUILD_UNIT_SOURCE_EXTENSIONS = new Set([
  "html",
  "htm",
  "css",
  "js",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "json",
  "txt",
  "md"
]);

export function normalizeMime(raw: string | null | undefined): string {
  const m = (raw ?? "").trim().toLowerCase();
  if (m === "image/jpg") return "image/jpeg";
  return m;
}

export function extFromName(name: string): string {
  const i = name.lastIndexOf(".");
  if (i < 0) return "";
  return name.slice(i + 1).toLowerCase();
}

export function assertPreviewUploadAllowed(args: {
  mimeType: string | null | undefined;
  sizeBytes: number;
}): void {
  if (args.sizeBytes > BUILD_UNIT_PREVIEW_MAX_BYTES) {
    throw new Error(`Preview image exceeds ${BUILD_UNIT_PREVIEW_MAX_BYTES} bytes.`);
  }
  const m = normalizeMime(args.mimeType);
  if (!BUILD_UNIT_PREVIEW_ALL_MIMES.has(m)) {
    throw new Error("Preview must be PNG, JPEG, WebP, or HTML for live preview.");
  }
}

export function assertSourceUploadAllowed(args: {
  mimeType: string | null | undefined;
  originalName: string;
  sizeBytes: number;
}): void {
  if (args.sizeBytes > BUILD_UNIT_SOURCE_MAX_BYTES) {
    throw new Error(`Source file exceeds ${BUILD_UNIT_SOURCE_MAX_BYTES} bytes.`);
  }
  const m = normalizeMime(args.mimeType);
  const ext = extFromName(args.originalName);
  const mimeOk = m && BUILD_UNIT_SOURCE_MIMES.has(m);
  const extOk = ext && BUILD_UNIT_SOURCE_EXTENSIONS.has(ext);
  if (!mimeOk && !extOk) {
    throw new Error("Source must be html, css, js, ts, tsx, json, txt, or similar text.");
  }
}
