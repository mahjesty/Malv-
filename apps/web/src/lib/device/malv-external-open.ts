/**
 * Platform-aware copy and hints for “open this URL outside the in-app preview” flows.
 * Wording matches the user’s likely system browser / shell without claiming impossible precision.
 */

export type MalvCapacitorPlatform = "ios" | "android" | "web";

export type MalvExternalOpenHints = {
  userAgent: string;
  /** iOS “Add to Home Screen” standalone mode */
  iosStandalonePwa?: boolean;
  /** When Capacitor (or compatible) is present */
  capacitorPlatform?: MalvCapacitorPlatform | null;
  /** `navigator.maxTouchPoints` — helps classify iPadOS desktop UA */
  maxTouchPoints?: number;
};

function readCapacitorPlatformFromWindow(w: Window & { Capacitor?: { getPlatform?: () => string } }): MalvCapacitorPlatform | null {
  const p = w.Capacitor?.getPlatform?.();
  if (p === "ios" || p === "android" || p === "web") return p;
  return null;
}

/** Browser-only; safe to call from React effects/components (not during SSR import). */
export function getMalvExternalOpenHintsFromBrowser(): MalvExternalOpenHints {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { userAgent: "", iosStandalonePwa: false, capacitorPlatform: null, maxTouchPoints: 0 };
  }
  const ua = navigator.userAgent || "";
  const standalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  const maxTp = typeof navigator.maxTouchPoints === "number" ? navigator.maxTouchPoints : undefined;
  const cap = readCapacitorPlatformFromWindow(window as Window & { Capacitor?: { getPlatform?: () => string } });

  return {
    userAgent: ua,
    iosStandalonePwa: standalone,
    capacitorPlatform: cap,
    maxTouchPoints: maxTp
  };
}

export function isIosLikeUserAgent(ua: string, maxTouchPoints?: number): boolean {
  if (/iPhone|iPod|iPad/i.test(ua)) return true;
  if (/Macintosh/i.test(ua) && typeof maxTouchPoints === "number" && maxTouchPoints > 1) return true;
  return false;
}

export function isAndroidUserAgent(ua: string): boolean {
  return /Android/i.test(ua);
}

export function isDesktopWebUserAgent(ua: string, maxTouchPoints?: number): boolean {
  if (!ua.trim()) return false;
  if (isAndroidUserAgent(ua)) return false;
  if (isIosLikeUserAgent(ua, maxTouchPoints)) return false;
  if (/webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return false;
  return true;
}

/** Embedded / in-app browsers where we should not promise “Safari”. */
export function isLikelyIosEmbeddedBrowser(ua: string): boolean {
  return /FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|Line\/|MicroMessenger|Snapchat|Twitter|TikTok|GSA\//i.test(ua);
}

export function isAndroidWebViewUserAgent(ua: string): boolean {
  return isAndroidUserAgent(ua) && /; wv\)|\bwv\b/i.test(ua);
}

/**
 * Short label for a compact header / utility control (icon pairs with this text).
 */
export function resolveMalvExternalOpenButtonLabel(h: MalvExternalOpenHints): string {
  const ua = h.userAgent;
  const mtp = h.maxTouchPoints;

  if (h.capacitorPlatform === "ios") return "Open in Safari";
  if (h.capacitorPlatform === "android") return "Open externally";

  if (isDesktopWebUserAgent(ua, mtp)) return "Open in browser";

  if (isAndroidUserAgent(ua)) {
    if (isAndroidWebViewUserAgent(ua)) return "Open externally";
    return "Open in browser";
  }

  if (isIosLikeUserAgent(ua, mtp)) {
    if (isLikelyIosEmbeddedBrowser(ua)) return "Open externally";
    if (/CriOS\//i.test(ua)) return "Open in Chrome";
    if (/FxiOS\//i.test(ua)) return "Open in Firefox";
    if (/EdgiOS\//i.test(ua)) return "Open in Edge";
    if (h.iosStandalonePwa) return "Open in Safari";
    if (/Safari\//i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\//i.test(ua)) return "Open in Safari";
    return "Open externally";
  }

  return "Open externally";
}

/** Accessible description fragment referencing the same wording as the visible control. */
export function resolveMalvExternalOpenPreviewAriaDescription(h: MalvExternalOpenHints): string {
  const label = resolveMalvExternalOpenButtonLabel(h);
  return `In-app page preview. If the page does not appear, use ${label}.`;
}

/** Longer UX copy for dialogs (sources list, compare sheet, etc.). */
export function resolveMalvExternalOpenSourcesFlowBlurb(h: MalvExternalOpenHints): string {
  const label = resolveMalvExternalOpenButtonLabel(h);
  return `Open each reference in the in-app preview first. For the full site, use “${label}” in the preview header.`;
}

export type MalvRichQuickActionLike = { id: string };

/**
 * Removes server/client `open_externally` chips so the thread stays quiet; external open lives in {@link MalvInternalLinkBrowser}.
 */
export function malvPruneExternalOpenQuickActions<T extends MalvRichQuickActionLike>(actions: T[]): T[] {
  return actions.filter((a) => a.id !== "open_externally");
}
