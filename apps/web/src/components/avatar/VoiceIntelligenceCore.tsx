import { useEffect, useMemo, useRef, useState } from "react";
import {
  animate,
  motion,
  motionValue,
  useAnimationFrame,
  useMotionValue,
  useSpring,
  type MotionValue
} from "motion/react";
import type { PresenceState } from "@/components/malv/presence/types";
import { cn } from "@/lib/cn";

export type VoiceCorePhase = "idle" | "listening" | "speaking" | "responding" | "connecting";

/** @deprecated Use VoiceCorePhase */
export type VoiceIntelligenceMode = VoiceCorePhase;

export interface VoiceIntelligenceCoreProps {
  /** Primary prop: animation phase */
  phase?: VoiceCorePhase;
  /** @deprecated Use `phase` */
  mode?: VoiceCorePhase;
  /** Optional 0–1 level (e.g. real audio); blended with internal simulation */
  energy?: number;
  coreLabel?: string;
  className?: string;
}

const PARTICLE_COUNT = 38;

function hash01(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

type ParticleCfg = {
  baseAngle: number;
  rNorm: number;
  wa: number;
  wb: number;
  wc: number;
  pa: number;
  pb: number;
  pc: number;
  aa: number;
  ab: number;
  ac: number;
  wr: number;
  pr: number;
  ar: number;
  baseOpa: number;
  baseSc: number;
  sizePx: number;
  cyan: boolean;
};

function buildConfigs(): ParticleCfg[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const h = (s: number) => hash01(i, s);
    const layer = i % 5 === 0 ? 0 : i % 4 === 0 ? 2 : 1;
    return {
      baseAngle: h(0) * Math.PI * 2,
      rNorm: layer === 0 ? 0.32 + h(1) * 0.22 : layer === 1 ? 0.38 + h(1) * 0.28 : 0.44 + h(1) * 0.2,
      wa: 0.11 + h(2) * 0.19,
      wb: 0.17 + h(3) * 0.24,
      wc: 0.23 + h(4) * 0.31,
      pa: h(5) * Math.PI * 2,
      pb: h(6) * Math.PI * 2,
      pc: h(7) * Math.PI * 2,
      aa: 0.14 + h(8) * 0.22,
      ab: 0.1 + h(9) * 0.16,
      ac: 0.06 + h(10) * 0.12,
      wr: 0.38 + h(11) * 0.5,
      pr: h(12) * Math.PI * 2,
      ar: 0.04 + h(13) * 0.07,
      baseOpa: layer === 0 ? 0.22 + h(14) * 0.12 : layer === 1 ? 0.38 + h(14) * 0.2 : 0.52 + h(14) * 0.22,
      baseSc: layer === 0 ? 0.82 : layer === 1 ? 1 : 1.12,
      sizePx: layer === 0 ? 1.5 + h(15) * 1.1 : 2 + h(15) * 1.5,
      cyan: h(16) > 0.44
    };
  });
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function phaseTimeScale(phase: VoiceCorePhase, audio: number): number {
  const a = audio;
  switch (phase) {
    case "speaking":
      return 0.95 + a * 1.35;
    case "listening":
      return 0.55 + a * 0.45;
    case "responding":
      return 0.72 + a * 0.35;
    case "connecting":
      return 0.88 + a * 0.55;
    case "idle":
    default:
      return 0.38 + a * 0.22;
  }
}

function phaseRadialBias(phase: VoiceCorePhase, audio: number): number {
  const a = audio;
  switch (phase) {
    case "speaking":
      return 0.78 + a * 0.34;
    case "listening":
      return 0.86 - a * 0.08;
    case "responding":
      return 0.92 + a * 0.12;
    case "connecting":
      return 0.84 + a * 0.1;
    case "idle":
    default:
      return 0.8 + a * 0.06;
  }
}

type ParticleMV = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  opacity: MotionValue<number>;
  scale: MotionValue<number>;
};

function createParticleMVs(n: number): ParticleMV[] {
  return Array.from({ length: n }, () => ({
    x: motionValue(0),
    y: motionValue(0),
    opacity: motionValue(0.5),
    scale: motionValue(1)
  }));
}

export function VoiceIntelligenceCore({
  phase: phaseProp,
  mode,
  energy,
  coreLabel,
  className
}: VoiceIntelligenceCoreProps) {
  const phase = phaseProp ?? mode ?? "listening";
  const configs = useMemo(() => buildConfigs(), []);
  const particleMvs = useMemo(() => createParticleMVs(PARTICLE_COUNT), []);

  const containerRef = useRef<HTMLDivElement>(null);
  const extentRef = useRef(104);
  const [, setExtentTick] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const m = Math.min(r.width, r.height);
      extentRef.current = m * 0.46;
      setExtentTick((k) => k + 1);
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    extentRef.current = Math.min(r.width, r.height) * 0.46;
    return () => ro.disconnect();
  }, []);

  const simAudio = useMotionValue(0.48);
  useEffect(() => {
    const ctrl = animate(simAudio, [0.14, 0.86, 0.24, 0.9, 0.2, 0.72, 0.32, 0.84, 0.18, 0.68, 0.28], {
      duration: 17,
      repeat: Infinity,
      ease: [0.45, 0, 0.55, 1]
    });
    return () => ctrl.stop();
  }, [simAudio]);

  const smoothAudio = useSpring(simAudio, { stiffness: 32, damping: 18, mass: 0.38 });

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const energyRef = useRef(energy);
  energyRef.current = energy;

  const coreScale = useMotionValue(1);
  const coreGlow = useMotionValue(0.52);
  const haloCyan = useMotionValue(0.14);
  const haloViolet = useMotionValue(0.11);

  useAnimationFrame(() => {
    const ph = phaseRef.current;
    const ext = extentRef.current;
    const sim = smoothAudio.get();
    const extEnergy = energyRef.current;
    const audio =
      extEnergy === undefined ? sim : clamp01(0.52 * sim + 0.48 * clamp01(extEnergy));
    const ts = phaseTimeScale(ph, audio);
    const te = performance.now() / 1000;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const c = configs[i];
      const pm = particleMvs[i];

      let ang =
        c.baseAngle +
        Math.sin(te * c.wa * ts + c.pa) * c.aa +
        Math.sin(te * c.wb * ts + c.pb) * c.ab +
        Math.sin(te * c.wc * ts + c.pc) * c.ac;

      let rad =
        c.rNorm *
        ext *
        (1 + Math.sin(te * c.wr * ts + c.pr) * c.ar * (0.55 + audio * 0.45));

      if (ph === "speaking") {
        ang += Math.sin(te * (2.6 + audio * 2.2) + i * 0.63) * (0.1 + audio * 0.32);
        rad *= 1 + (0.05 + audio * 0.16) * Math.sin(te * (3.2 + audio) + c.pa);
      } else if (ph === "listening") {
        const scan = Math.sin(te * (0.88 + audio * 0.35) + c.baseAngle * 2.1) * (0.045 + audio * 0.09);
        rad *= 1 + scan;
        ang += Math.sin(te * 0.62 + i * 0.37) * (0.042 + audio * 0.05);
      } else if (ph === "responding") {
        const wave = Math.sin(te * 1.02 - i * 0.36);
        ang += wave * (0.11 + audio * 0.12);
        rad *= 1 + wave * (0.038 + audio * 0.04);
      } else if (ph === "connecting") {
        ang += Math.sin(te * (4.1 + audio * 2.4) + i * 1.05) * (0.035 + audio * 0.04);
        rad *= 1 + Math.sin(te * (5.2 + audio * 1.8) + i * 1.4) * (0.028 + audio * 0.035);
      } else {
        rad *= 1 + Math.sin(te * 0.48 + c.pr) * (0.028 + audio * 0.02);
        ang += Math.sin(te * 0.31 + c.pb) * 0.035;
      }

      const spread = (0.68 + audio * 0.36) * phaseRadialBias(ph, audio);
      rad *= spread;

      const lx = Math.sin(te * 0.31 + c.pa) * ext * (0.01 + audio * 0.022);
      const ly = Math.cos(te * 0.27 + c.pb) * ext * (0.009 + audio * 0.02);

      pm.x.set(Math.cos(ang) * rad + lx);
      pm.y.set(Math.sin(ang) * rad + ly);

      const flicker =
        ph === "speaking"
          ? Math.sin(te * (5.5 + audio * 4) + i * 1.1) * 0.07 * audio
          : Math.sin(te * 0.75 + i * 0.5) * 0.045;
      pm.opacity.set(clamp01(c.baseOpa * (0.78 + audio * 0.32 + flicker)));

      const scJ =
        ph === "speaking"
          ? 1 + Math.sin(te * (4.2 + audio * 3) + i * 0.9) * (0.07 * audio)
          : ph === "connecting"
            ? 1 + Math.sin(te * 6.2 + i) * 0.05 * (0.4 + audio)
            : 1 + Math.sin(te * 0.9 + i * 0.3) * 0.04 * (0.3 + audio);
      pm.scale.set(Math.max(0.72, c.baseSc * scJ * (0.88 + audio * 0.14)));
    }

    const breath = Math.sin(te * (0.85 + audio * 0.5)) * (ph === "idle" ? 0.028 : 0.038);
    coreScale.set(1 + breath + (ph === "speaking" ? audio * 0.045 : ph === "connecting" ? audio * 0.025 : 0));
    coreGlow.set(0.42 + audio * 0.48 + (ph === "speaking" ? 0.06 : 0));
    haloCyan.set(0.08 + audio * 0.22 + (ph === "speaking" ? 0.06 : ph === "listening" ? 0.04 : 0));
    haloViolet.set(0.07 + audio * 0.18 + (ph === "responding" ? 0.05 : 0));
  });

  return (
    <div ref={containerRef} className={cn("relative flex h-full w-full items-center justify-center", className)}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <motion.div
          className="absolute left-1/2 top-1/2 h-[50%] w-[50%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300/25"
          style={{
            opacity: haloCyan,
            scale: coreScale,
            filter: "blur(18px)"
          }}
        />
        <motion.div
          className="absolute left-1/2 top-1/2 h-[40%] w-[40%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-400/22"
          style={{
            opacity: haloViolet,
            scale: coreScale,
            filter: "blur(16px)"
          }}
        />
      </div>

      <div className="relative aspect-square h-full max-h-full w-full max-w-full">
        {configs.map((c, i) => (
          <motion.div
            key={i}
            className="pointer-events-none absolute left-1/2 top-1/2"
            style={{
              x: particleMvs[i].x,
              y: particleMvs[i].y,
              opacity: particleMvs[i].opacity,
              scale: particleMvs[i].scale,
              width: c.sizePx,
              height: c.sizePx,
              marginLeft: -c.sizePx / 2,
              marginTop: -c.sizePx / 2,
              willChange: "transform, opacity"
            }}
          >
            <div
              className={cn(
                "h-full w-full rounded-full",
                c.cyan
                  ? "bg-[rgba(125,231,252,0.9)] shadow-[0_0_5px_rgba(34,211,238,0.32)]"
                  : "bg-[rgba(196,181,253,0.88)] shadow-[0_0_5px_rgba(167,139,250,0.28)]"
              )}
            />
          </motion.div>
        ))}

        <div className="absolute left-1/2 top-1/2 z-10 flex h-0 w-0 items-center justify-center">
          <motion.div
            className="relative flex h-[clamp(2.5rem,17vw,3.35rem)] w-[clamp(2.5rem,17vw,3.35rem)] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full ring-1 ring-white/[0.1]"
            style={{ scale: coreScale, willChange: "transform" }}
          >
            <motion.div
              className="absolute inset-0 rounded-full bg-gradient-to-br from-cyan-200/[0.18] via-white/[0.06] to-violet-300/[0.15]"
              style={{ opacity: coreGlow, filter: "blur(8px)" }}
            />
            <div className="absolute inset-[16%] rounded-full bg-gradient-to-br from-slate-950/88 via-slate-900/75 to-slate-950/92" />
            <motion.div
              className="absolute inset-[24%] rounded-full"
              style={{
                opacity: coreGlow,
                background:
                  "radial-gradient(circle at 32% 28%, rgba(165,243,252,0.5), transparent 52%), radial-gradient(circle at 72% 68%, rgba(196,181,253,0.42), transparent 48%)"
              }}
            />
            {coreLabel ? (
              <span className="relative z-[1] text-[clamp(1.05rem,5vw,1.35rem)] font-semibold tracking-tight text-white/94">
                {coreLabel.slice(0, 1).toUpperCase()}
              </span>
            ) : null}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export function liveAvatarCorePhase(state: "live" | "generating" | "switching", speaking: boolean): VoiceCorePhase {
  if (state === "switching") return "connecting";
  if (state === "generating") return "responding";
  if (speaking) return "speaking";
  return "listening";
}

/** @deprecated Prefer liveAvatarCorePhase */
export function liveAvatarMode(state: "live" | "generating" | "switching", speaking: boolean): VoiceCorePhase {
  return liveAvatarCorePhase(state, speaking);
}

export function presenceToVoiceCorePhase(state: PresenceState): VoiceCorePhase {
  if (state === "thinking") return "responding";
  if (state === "reconnecting") return "connecting";
  if (state === "speaking") return "speaking";
  if (state === "listening") return "listening";
  return "idle";
}

/** @deprecated Prefer presenceToVoiceCorePhase */
export const presenceToVoiceMode = presenceToVoiceCorePhase;
