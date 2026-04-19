/**
 * MALV image mode tiles — unified charcoal + gold/live washes (no per-card rainbow Tailwind hues).
 * Stable per `id` so each card keeps a consistent look across sessions.
 */
const MALV_MODE_GRADIENTS = [
  "from-[rgb(var(--malv-surface-overlay-rgb)/0.9)] via-[rgb(var(--malv-surface-base-rgb)/0.48)] to-black/52",
  "from-malv-f-gold/[0.15] via-[rgb(var(--malv-surface-base-rgb)/0.5)] to-black/50",
  "from-malv-f-live/[0.12] via-[rgb(var(--malv-surface-raised-rgb)/0.46)] to-black/54",
  "from-malv-f-gold/[0.08] via-[rgb(var(--malv-surface-base-rgb)/0.44)] to-black/56"
] as const;

const GLOW_RAIL_LIVE =
  "hover:shadow-[0_26px_56px_rgba(0,0,0,0.55),0_0_40px_rgb(var(--malv-f-live-rgb)/0.22)]";
const GLOW_RAIL_GOLD =
  "hover:shadow-[0_26px_56px_rgba(0,0,0,0.55),0_0_38px_rgb(var(--malv-f-gold-rgb)/0.16)]";
const GLOW_COMPACT_LIVE =
  "hover:shadow-[0_20px_48px_rgba(0,0,0,0.5),0_0_34px_rgb(var(--malv-f-live-rgb)/0.18)]";
const GLOW_COMPACT_GOLD =
  "hover:shadow-[0_20px_48px_rgba(0,0,0,0.5),0_0_32px_rgb(var(--malv-f-gold-rgb)/0.14)]";

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function malvModeCardVisuals(
  id: string,
  density: "rail" | "compact"
): { gradientClass: string; glowClass: string } {
  const h = hashId(id);
  const gradientClass = MALV_MODE_GRADIENTS[h % MALV_MODE_GRADIENTS.length];
  const goldGlow = (h >> 5) % 2 === 0;
  if (density === "compact") {
    return {
      gradientClass,
      glowClass: goldGlow ? GLOW_COMPACT_GOLD : GLOW_COMPACT_LIVE
    };
  }
  return {
    gradientClass,
    glowClass: goldGlow ? GLOW_RAIL_GOLD : GLOW_RAIL_LIVE
  };
}
