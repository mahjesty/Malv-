import type { MalvUniversalResponseMode } from "./malv-universal-capability-router.util";

/**
 * Routes that may attach structured sources (pills and/or stripping targets).
 * {@link resolveMalvRichSurfaceDisplayPolicy} decides per-turn density (e.g. mixed visual is pill-light until multi-source).
 */
export function malvRouteSupportsSourcePillChrome(mode: MalvUniversalResponseMode): boolean {
  return (
    mode === "web_research" ||
    mode === "mixed_text_plus_sources" ||
    mode === "mixed_text_plus_visual" ||
    mode === "finance_data"
  );
}
