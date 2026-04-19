/**
 * Deterministic rules for rejecting static preview URLs that are app-shipped placeholders or
 * synthetic catalog assets — they must not be treated as successful real preview output.
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

/**
 * TODO(backend-contract): Opaque preview URLs (UUID paths, signed CDN keys) cannot be distinguished from
 * synthetic SVG placeholders on the client without server-side provenance. A field such as `previewKind` /
 * `previewImageProvenance` on the unit row would let us reject marketing placeholders without filename-only rules.
 */

function trimmedOrEmpty(url: string | null | undefined): string {
  return typeof url === "string" ? url.trim() : "";
}

/** Pathname only, lowercased, no query string. Empty if not derivable. */
export function previewUrlPathnameLower(url: string): string {
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

/**
 * True when `url` clearly points at a known placeholder asset or synthetic snapshot filename.
 * Does not use heuristics beyond path/filename shape.
 */
export function isLikelyPlaceholderPreviewImageUrl(url: string | null | undefined): boolean {
  const raw = trimmedOrEmpty(url);
  if (!raw) return false;
  if (raw.toLowerCase().startsWith("data:")) return false;

  const path = previewUrlPathnameLower(raw);
  if (!path) {
    // Non-absolute URL we cannot parse — do not guess
    return false;
  }

  const seg = lastPathSegment(path);
  if (PLACEHOLDER_EXACT_FILES.has(seg)) return true;

  // Strip one extension for `placeholder.<ext>` variants we did not enumerate
  const base = seg.replace(/\.(svg|png|jpe?g|webp|gif)$/i, "");
  if (base === "placeholder") return true;

  if (path.includes("/dist/") && seg.toLowerCase().startsWith("placeholder")) return true;

  return false;
}

/**
 * Absolute preview image URLs that may be treated as real catalog thumbnails.
 * Root-relative paths are excluded — they are not validated provenance and must not imply a real preview.
 */
export function isUsableExternalPreviewImageUrl(url: string | null | undefined): boolean {
  const t = trimmedOrEmpty(url);
  if (!t) return false;
  if (isLikelyPlaceholderPreviewImageUrl(t)) return false;
  return /^https?:\/\//i.test(t) || t.startsWith("blob:");
}

/** Returns trimmed URL or null if empty or not usable. */
export function usableExternalPreviewImageUrl(url: string | null | undefined): string | null {
  const t = trimmedOrEmpty(url);
  if (!t) return null;
  return isUsableExternalPreviewImageUrl(t) ? t : null;
}

let previewInvariantWarned = new Set<string>();

/** Test hook: clears dev-only invariant dedupe keys. */
export function resetPreviewInvariantDevDedupeForTests(): void {
  previewInvariantWarned.clear();
}

/**
 * Dev-only: emit when a placeholder `previewImageUrl` is still present at a boundary that should already
 * have sanitized client state. Does not throw; production is a no-op.
 */
export function devWarnPreviewInvariantViolation(
  phase: string,
  detail: { unitId?: string; previewImageUrl?: string | null }
): void {
  if (!import.meta.env.DEV) return;
  if (!isLikelyPlaceholderPreviewImageUrl(detail.previewImageUrl)) return;
  const key = `${phase}::${detail.unitId ?? "unknown"}`;
  if (previewInvariantWarned.has(key)) return;
  previewInvariantWarned.add(key);
  console.warn(`[PreviewInvariantViolation] ${phase}`, detail);
}

/**
 * Nulls `previewImageUrl` when it is not a usable absolute http(s) or blob URL per shared rules (includes known placeholders).
 * Call at ingest / normalization boundaries so bad values never enter long-lived query state.
 */
export function sanitizeBuildUnitPreviewFields<T extends { previewImageUrl?: string | null }>(unit: T): T {
  if (import.meta.env.DEV && isLikelyPlaceholderPreviewImageUrl(unit.previewImageUrl)) {
    const rid = unit as unknown as { id?: unknown };
    devWarnPreviewInvariantViolation("sanitizeBuildUnitPreviewFields", {
      unitId: typeof rid.id === "string" ? rid.id : undefined,
      previewImageUrl: unit.previewImageUrl ?? null
    });
  }

  const next = usableExternalPreviewImageUrl(unit.previewImageUrl);
  const prev = unit.previewImageUrl ?? null;

  if (next === prev) return unit;
  if (next !== null && prev !== null && typeof prev === "string" && prev.trim() === next) {
    return { ...unit, previewImageUrl: next };
  }
  if (next === null && prev === null) return unit;
  return { ...unit, previewImageUrl: next };
}

/** Alias for non–build-unit rows that still carry `previewImageUrl` (same rules). */
export function sanitizePreviewFields<T extends { previewImageUrl?: string | null }>(row: T): T {
  return sanitizeBuildUnitPreviewFields(row);
}

/** Clears unusable `previewImageUrl` (placeholders and other non-usable URLs). Prefer at boundaries; same as {@link sanitizeBuildUnitPreviewFields}. */
export function stripPlaceholderPreviewImageUrlFields<T extends { previewImageUrl?: string | null }>(unit: T): T {
  return sanitizeBuildUnitPreviewFields(unit);
}

/**
 * When the supplement row is strictly newer, reconcile static preview URLs: adopt the first usable URL
 * (supplement, then canonical) so stale placeholders do not survive.
 */
export function mergePreviewImageUrlWhenSupplementNewer(
  canonical: { previewImageUrl?: string | null },
  supplement: { previewImageUrl?: string | null }
): string | null {
  return (
    usableExternalPreviewImageUrl(supplement.previewImageUrl) ??
    usableExternalPreviewImageUrl(canonical.previewImageUrl) ??
    null
  );
}
