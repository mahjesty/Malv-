# MALV frontend foundation

This document describes the reusable UI foundation for the web app (`apps/web`). It is intentionally narrow: tokens, motion discipline, and a small set of primitives. It does not prescribe page layouts or marketing copy.

## Stack constraints

- React, TypeScript, Vite (`apps/web`).
- Tailwind CSS for styling; global entry is `apps/web/src/styles/index.css` with `@import "tailwindcss"` first, loaded from `apps/web/src/main.tsx`.
- shadcn/ui for low-level primitives (`apps/web/src/components/ui/*`).
- Motion for React (`motion/react`) for micro-interactions only.
- lucide-react for icons.
- Do not add other UI kits or CSS frameworks.

## Files

| Area | Path |
| --- | --- |
| Foundation CSS variables | `apps/web/src/styles/malv.css` (imported in `main.tsx`) |
| Theme constants | `apps/web/src/lib/malv-theme.ts` |
| Motion presets | `apps/web/src/lib/malv-motion.ts` |
| Components | `apps/web/src/components/malv/*.tsx` |

## Color intent

- **Canvas / surfaces**: very dark charcoal in dark mode; soft layered panels, not flat gray slabs.
- **Gold (`malv-f-gold`)**: muted, rich, authoritative. Use for premium CTAs, selection, or rare emphasis — never as a page-wide wash.
- **Live accent (`malv-f-live`)**: soft teal-ish blue for hover, focus, and “intelligent / active” energy. Prefer this for everyday interaction.
- Avoid bright yellow-gold, loud neon, and competing gradients.

## Motion

- Use `useReducedMotion()` and skip hover/entrance motion when the user prefers reduced motion (components already do this where Motion is used).
- Keep durations short (roughly 140–220ms) and easing calm (`malv-motion.ts`). No bouncy springs for chrome-level UI.

## Components

- **MalvButton**: `primary` | `secondary` | `ghost` | `premium` (gold). Subtle hover lift and tap scale.
- **MalvCard**: `default` | `elevated` | `interactive`. Optional `reveal` entrance. Does not replace the legacy global `.malv-card` chat class — foundation cards are marked with `data-malv-foundation="card"`.
- **MalvPanel**: work-area / sidebar surfaces; optional `live` tone.
- **MalvInput**: dark premium field with strong focus ring on the live accent.
- **MalvSectionHeader**: title, optional subtitle, optional `actions` slot, optional divider.

## When to use foundation vs shadcn

- Use **Malv\*** components for new product surfaces that should feel consistently “MALV”.
- Reach for **shadcn/ui** for accessible primitives (dialogs, dropdowns, etc.) and compose Malv styling around them when needed.

## Tailwind tokens

Foundation colors are registered in `tailwind.config.js` as `malv-f-gold` and `malv-f-live` (RGB channels from CSS variables in `malv.css`).
