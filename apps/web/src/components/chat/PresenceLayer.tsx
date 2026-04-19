/**
 * PresenceLayer — environment layer that makes MALV feel alive.
 *
 * Design contract:
 *  - Purely atmospheric: no UI elements, no layout influence, no text
 *  - GPU-safe: only transform + opacity, never layout-affecting properties
 *  - Subconscious: all opacity values stay below the perceptible threshold
 *  - pointer-events: none — never intercepts input
 *  - contain: paint — isolates paint invalidation from the transcript
 *  - Respects prefers-reduced-motion
 *
 * State → environment mapping:
 *  idle       → invisible (opacity 0), no motion
 *  composing  → faint brand-blue top ambient, slow breath — "MALV is listening"
 *  thinking   → cyan ambient, brisk breath — "MALV is processing"
 *  streaming  → brand-blue ambient, medium breath — visible reply text is forming (not pre-token)
 *  error      → faint rose ambient, very slow — "something needs attention"
 */
import { motion, useReducedMotion } from "framer-motion";

export type PresenceMode = "idle" | "composing" | "thinking" | "streaming" | "error";

interface AmbientSpec {
  /** Outer layer opacity — keeps everything below perceptible threshold */
  opacity: number;
  /** RGB triplet for the gradient fill */
  color: string;
  /** One full breath cycle, seconds */
  breathPeriod: number;
  /** Scale delta at peak breath (e.g. 0.012 → animates to scale 1.012) */
  breathScale: number;
}

/**
 * All opacity values are intentionally low.
 * In dark mode (#0a0a0a canvas) the ambient is subliminal.
 * In light mode (#fafafa canvas) it becomes essentially invisible — the math works out.
 */
const AMBIENT: Record<PresenceMode, AmbientSpec> = {
  idle:      { opacity: 0,     color: "96,165,250",  breathPeriod: 9,   breathScale: 0      },
  composing: { opacity: 0.014, color: "96,165,250",  breathPeriod: 7.5, breathScale: 0.005  },
  thinking:  { opacity: 0.032, color: "34,211,238",  breathPeriod: 2.8, breathScale: 0.014  },
  streaming: { opacity: 0.025, color: "96,165,250",  breathPeriod: 3.2, breathScale: 0.010  },
  error:     { opacity: 0.012, color: "239,68,68",   breathPeriod: 7,   breathScale: 0.004  },
};

/** Framer Motion transition for mode changes — soft easeOut so mode shifts feel deliberate */
const MODE_TRANSITION = { duration: 0.85, ease: "easeOut" } as const;

/** Framer Motion transition for the continuous breath loop */
function breathTransition(period: number) {
  return {
    duration: period,
    repeat: Infinity,
    ease: "easeInOut",
    repeatType: "loop",
  } as const;
}

export function PresenceLayer({ mode }: { mode: PresenceMode }) {
  const prefersReducedMotion = useReducedMotion();
  const spec = AMBIENT[mode];
  const isBreathing = spec.breathScale > 0 && !prefersReducedMotion;

  return (
    <div
      aria-hidden
      // Sits above ::before (z-0) but below all transcript content (z-10+)
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ zIndex: 1, contain: "paint" }}
    >
      {/*
        Opacity controller — spring-smooth on mode change.
        Controls how "present" the ambient is per mode.
      */}
      <motion.div
        className="absolute inset-0"
        animate={{ opacity: spec.opacity }}
        transition={MODE_TRANSITION}
      >
        {/*
          Ambient radial — the actual glow source.
          Origin is top-center so the "light" appears to emanate from above.
          Breathing scale is relative to this origin: the gradient gently expands vertically.
        */}
        <motion.div
          className="absolute left-1/2 top-0 -translate-x-1/2"
          animate={
            isBreathing
              ? { scale: [1, 1 + spec.breathScale, 1] }
              : {}
          }
          transition={isBreathing ? breathTransition(spec.breathPeriod) : {}}
          style={{
            width: "88%",
            height: "52%",
            background: `radial-gradient(ellipse at 50% 0%, rgba(${spec.color}, 0.88), transparent 62%)`,
            transformOrigin: "50% 0%",
            willChange: isBreathing ? "transform" : "auto",
          }}
        />
      </motion.div>

      {/*
        Thinking pulse ring — a faint concentric ring that expands during cognitive phases.
        Only shown during "thinking" to signal internal processing without making it obvious.
        Outer opacity is 0 in other modes, so the ring is invisible by default.
      */}
      <motion.div
        className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2"
        animate={{
          opacity:
            mode === "thinking" && !prefersReducedMotion ? 0.018 : 0,
        }}
        transition={MODE_TRANSITION}
        style={{
          width: "60%",
          height: "30%",
          borderRadius: "50%",
          border: `1px solid rgba(34,211,238,0.5)`,
          willChange: "opacity",
        }}
      />
    </div>
  );
}
