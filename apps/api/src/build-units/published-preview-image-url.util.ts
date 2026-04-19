/**
 * Server-side rules for `previewImageUrl` exposed on build-unit API responses and persisted values.
 * Aligns with the web client's previewArtifactValidation: placeholders are never success; root-relative
 * catalog paths are resolved to absolute URLs using the configured web origin so clients receive a
 * consumable URL without implying unvalidated same-origin guesses.
 */

const PLACEHOLDER_EXACT_FILES = new Set([
  "placeholder.svg",
  "placeholder-logo.svg",
  "placeholder.png",
  "placeholder.jpg",
  "placeholder.jpeg",
  "placeholder.webp",
  "placeholder.gif",
  "explore-preview-snapshot.svg"
]);

function trimmedOrEmpty(url: string | null | undefined): string {
  return typeof url === "string" ? url.trim() : "";
}

/** Pathname only, lowercased, no query string. */
function previewUrlPathnameLower(url: string): string {
  const t = trimmedOrEmpty(url);
  if (!t) return "";
  try {
    if (/^https?:\/\//i.test(t)) {
      return new URL(t).pathname.toLowerCase();
    }
  } catch {
    /* ignore */
  }
  if (t.toLowerCase().startsWith("blob:")) return "";
  if (t.startsWith("/")) {
    const noQuery = t.split("?")[0] ?? t;
    return noQuery.toLowerCase();
  }
  return "";
}

function lastPathSegment(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1]! : "";
}

/** Matches web `isLikelyPlaceholderPreviewImageUrl` (filename / path shape only). */
export function isLikelyPlaceholderPreviewImageUrl(url: string | null | undefined): boolean {
  const raw = trimmedOrEmpty(url);
  if (!raw) return false;
  if (raw.toLowerCase().startsWith("data:")) return false;

  const path = previewUrlPathnameLower(raw);
  if (!path) return false;

  const seg = lastPathSegment(path);
  if (PLACEHOLDER_EXACT_FILES.has(seg)) return true;

  const base = seg.replace(/\.(svg|png|jpe?g|webp|gif)$/i, "");
  if (base === "placeholder") return true;

  if (path.includes("/dist/") && seg.toLowerCase().startsWith("placeholder")) return true;

  return false;
}

/**
 * First explicit origin from SOCKET_CORS_ORIGIN or WEB_ORIGIN (comma-separated), else local dev defaults.
 * Same precedence as `main.ts` CORS bootstrap (without duplicating full parsing).
 */
export function readWebAppOriginBaseFromEnv(): string {
  const raw = (
    process.env.SOCKET_CORS_ORIGIN ||
    process.env.WEB_ORIGIN ||
    "http://localhost:5173,http://localhost:3000"
  ).trim();
  const first = raw.split(",")[0]?.trim() || "http://localhost:5173";
  return first.replace(/\/+$/, "");
}

/**
 * Value safe to emit on API responses: absolute http(s), blob, or null.
 * Root-relative app paths (e.g. `/explore-catalog/*.svg`) become `origin + path`.
 * Placeholders and protocol-relative URLs become null.
 */
export function normalizePublishedPreviewImageUrl(url: string | null | undefined): string | null {
  const t = trimmedOrEmpty(url).slice(0, 500);
  if (!t) return null;
  if (isLikelyPlaceholderPreviewImageUrl(t)) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("blob:")) return t;
  if (t.startsWith("//")) return null;
  if (t.startsWith("/")) {
    const base = readWebAppOriginBaseFromEnv();
    return `${base}${t}`;
  }
  return null;
}

/** Strip placeholder URLs before persisting; keep stored relative paths for catalog definitions. */
export function sanitizePreviewImageUrlForPersistence(url: string | null | undefined): string | null {
  const t = trimmedOrEmpty(url).slice(0, 500);
  if (!t) return null;
  if (isLikelyPlaceholderPreviewImageUrl(t)) return null;
  return t;
}
