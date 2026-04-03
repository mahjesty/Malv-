'use client'

import { useEffect, useRef, useCallback, memo } from 'react'
import { cn } from '@/lib/cn'
import { audioLevelMinForVoiceState, orbLevelFromState, smoothOrbDisplayEnergy } from './voiceOrbDrive'

export type VoiceState = 'idle' | 'listening' | 'speaking' | 'thinking' | 'muted'

interface LivingOrbVisualizerProps {
  state: VoiceState
  /** Fallback when `micLevelRef` is not used (e.g. pre-call). */
  audioLevel?: number
  className?: string
  /** Live mic RMS 0–1; read every frame — avoids React re-renders during calls. */
  micLevelRef?: React.MutableRefObject<number>
  /** Call context for mapping; keep updated from parent each render (cheap). */
  orbContextRef?: React.MutableRefObject<{ socketConnected: boolean; micMuted: boolean }>
  /** Smoothed 0–1 drive written each frame (minimized bar, diagnostics). */
  orbOutputLevelRef?: React.MutableRefObject<number>
}

type Particle = {
  angle: number
  radius: number
  phase: number
  speed: number
  size: number
  band: number
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function hsla(h: number, s: number, l: number, a: number): string {
  return `hsla(${h}, ${s}%, ${l}%, ${a})`
}

function isMobileLike(): boolean {
  return typeof window !== 'undefined' && (window.innerWidth < 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent))
}

/**
 * Scene backdrop only — orb colors come from `OrbMood` (smoothly interpolated per frame).
 */
const HERO = {
  bg: [5, 8, 11] as const,
  bg2: [10, 14, 20] as const,
}

/** Premium teal-emerald shell + warm amber core — per-state targets are interpolated, not snapped. */
export type OrbMood = {
  /** Membrane / wisps / lower energy hue center */
  shellHue: number
  shellSat: number
  shellLight: number
  /** Scales base membrane alpha (brighter orb = higher) */
  lineAlphaMul: number
  /** Extra lightness on upper ribbons */
  strutLightBoost: number
  /** Atmospheric glow RGB + alpha (tight, not foggy) */
  glowInner: readonly [number, number, number]
  glowMid: readonly [number, number, number]
  glowOuter: readonly [number, number, number]
  glowInnerA: number
  glowMidA: number
  glowOuterA: number
  /** <1 = tighter falloff (sharper luminous disc) */
  glowTight: number
  /** Core body fill tint */
  coreTint: readonly [number, number, number]
  /** Interior sheet lines */
  interiorHue: number
  interiorSat: number
  interiorLight: number
  /** Inner intelligence particles — distinct warm amber family */
  particleHue: number
  particleSat: number
  particleLight: number
  particleAlpha: number
  particleSize: number
  /** Motion: drift speed, inward gather (thinking), pulse rate */
  ptDrift: number
  ptGather: number
  ptPulse: number
}

function rgba(rgb: readonly [number, number, number], a: number): string {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`
}

function rgbLerp(a: readonly [number, number, number], b: readonly [number, number, number], t: number): [number, number, number] {
  return [
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
  ]
}

/** State-driven mood targets — bright controlled blue-green shell, warm pale amber particles. */
function moodTargetForState(s: VoiceState): OrbMood {
  switch (s) {
    case 'listening':
      return {
        shellHue: 174,
        shellSat: 64,
        shellLight: 86,
        lineAlphaMul: 1.22,
        strutLightBoost: 6,
        glowInner: [72, 195, 188],
        glowMid: [36, 120, 128],
        glowOuter: [18, 64, 72],
        glowInnerA: 0.54,
        glowMidA: 0.28,
        glowOuterA: 0.11,
        glowTight: 0.91,
        coreTint: [40, 130, 128],
        interiorHue: 176,
        interiorSat: 58,
        interiorLight: 84,
        particleHue: 44,
        particleSat: 58,
        particleLight: 88,
        particleAlpha: 0.32,
        particleSize: 1.38,
        ptDrift: 1.02,
        ptGather: 0.025,
        ptPulse: 1.14,
      }
    case 'thinking':
      return {
        shellHue: 232,
        shellSat: 52,
        shellLight: 78,
        lineAlphaMul: 1.14,
        strutLightBoost: 4,
        glowInner: [88, 72, 160],
        glowMid: [48, 42, 92],
        glowOuter: [28, 32, 58],
        glowInnerA: 0.5,
        glowMidA: 0.26,
        glowOuterA: 0.095,
        glowTight: 0.92,
        coreTint: [52, 48, 98],
        interiorHue: 238,
        interiorSat: 48,
        interiorLight: 80,
        particleHue: 46,
        particleSat: 62,
        particleLight: 90,
        particleAlpha: 0.34,
        particleSize: 1.4,
        ptDrift: 0.58,
        ptGather: 0.26,
        ptPulse: 0.92,
      }
    case 'speaking':
      return {
        shellHue: 172,
        shellSat: 66,
        shellLight: 88,
        lineAlphaMul: 1.22,
        strutLightBoost: 6,
        glowInner: [100, 218, 205],
        glowMid: [48, 155, 152],
        glowOuter: [26, 88, 96],
        glowInnerA: 0.58,
        glowMidA: 0.3,
        glowOuterA: 0.11,
        glowTight: 0.9,
        coreTint: [44, 152, 148],
        interiorHue: 172,
        interiorSat: 60,
        interiorLight: 86,
        particleHue: 42,
        particleSat: 58,
        particleLight: 90,
        particleAlpha: 0.36,
        particleSize: 1.42,
        ptDrift: 1.06,
        ptGather: 0.018,
        ptPulse: 1.02,
      }
    case 'muted':
      return {
        shellHue: 210,
        shellSat: 14,
        shellLight: 58,
        lineAlphaMul: 0.55,
        strutLightBoost: 2,
        glowInner: [28, 36, 44],
        glowMid: [18, 22, 30],
        glowOuter: [12, 14, 20],
        glowInnerA: 0.18,
        glowMidA: 0.1,
        glowOuterA: 0.05,
        glowTight: 0.98,
        coreTint: [32, 38, 46],
        interiorHue: 208,
        interiorSat: 12,
        interiorLight: 58,
        particleHue: 40,
        particleSat: 18,
        particleLight: 62,
        particleAlpha: 0.1,
        particleSize: 1.05,
        ptDrift: 0.35,
        ptGather: 0,
        ptPulse: 0.4,
      }
    case 'idle':
    default:
      return {
        shellHue: 172,
        shellSat: 60,
        shellLight: 82,
        lineAlphaMul: 1.08,
        strutLightBoost: 5,
        glowInner: [58, 175, 168],
        glowMid: [32, 98, 105],
        glowOuter: [16, 52, 58],
        glowInnerA: 0.44,
        glowMidA: 0.24,
        glowOuterA: 0.095,
        glowTight: 0.92,
        coreTint: [34, 115, 118],
        interiorHue: 174,
        interiorSat: 54,
        interiorLight: 82,
        particleHue: 43,
        particleSat: 56,
        particleLight: 86,
        particleAlpha: 0.28,
        particleSize: 1.32,
        ptDrift: 0.78,
        ptGather: 0.055,
        ptPulse: 0.72,
      }
  }
}

function smoothMood(prev: OrbMood, target: OrbMood, k: number): OrbMood {
  return {
    shellHue: lerp(prev.shellHue, target.shellHue, k),
    shellSat: lerp(prev.shellSat, target.shellSat, k),
    shellLight: lerp(prev.shellLight, target.shellLight, k),
    lineAlphaMul: lerp(prev.lineAlphaMul, target.lineAlphaMul, k),
    strutLightBoost: lerp(prev.strutLightBoost, target.strutLightBoost, k),
    glowInner: rgbLerp(prev.glowInner, target.glowInner, k),
    glowMid: rgbLerp(prev.glowMid, target.glowMid, k),
    glowOuter: rgbLerp(prev.glowOuter, target.glowOuter, k),
    glowInnerA: lerp(prev.glowInnerA, target.glowInnerA, k),
    glowMidA: lerp(prev.glowMidA, target.glowMidA, k),
    glowOuterA: lerp(prev.glowOuterA, target.glowOuterA, k),
    glowTight: lerp(prev.glowTight, target.glowTight, k),
    coreTint: rgbLerp(prev.coreTint, target.coreTint, k),
    interiorHue: lerp(prev.interiorHue, target.interiorHue, k),
    interiorSat: lerp(prev.interiorSat, target.interiorSat, k),
    interiorLight: lerp(prev.interiorLight, target.interiorLight, k),
    particleHue: lerp(prev.particleHue, target.particleHue, k),
    particleSat: lerp(prev.particleSat, target.particleSat, k),
    particleLight: lerp(prev.particleLight, target.particleLight, k),
    particleAlpha: lerp(prev.particleAlpha, target.particleAlpha, k),
    particleSize: lerp(prev.particleSize, target.particleSize, k),
    ptDrift: lerp(prev.ptDrift, target.ptDrift, k),
    ptGather: lerp(prev.ptGather, target.ptGather, k),
    ptPulse: lerp(prev.ptPulse, target.ptPulse, k),
  }
}

function lineHueBand(
  mood: OrbMood,
  ribbonV: number,
  drift: number,
  state: VoiceState
): { h: number; s: number; l: number } {
  const desat = state === 'muted'
  if (desat) {
    const h = mood.shellHue + drift * 0.35
    return { h, s: mood.shellSat, l: mood.shellLight }
  }
  const spread =
    ribbonV < 0.34 ? -4 + drift * 0.6 :
    ribbonV < 0.64 ? drift * 0.45 :
    5 + drift * 0.35
  const h = mood.shellHue + spread
  const upper = smoothstep(0.55, 1.0, ribbonV)
  const l = mood.shellLight + upper * mood.strutLightBoost
  return { h, s: mood.shellSat, l }
}

function stateConfig(state: VoiceState) {
  /** Silhouette stays dense; state reads in timing / harmonics / inner turbulence, not ballooning scale. */
  switch (state) {
    case 'listening':
      return {
        motion: 1.02,
        amplitude: 0.76,
        glow: 0.86,
        wisps: 0.88,
        particles: 0.88,
        basin: 0.88,
      }
    case 'speaking':
      return {
        motion: 1.04,
        amplitude: 0.74,
        glow: 0.92,
        wisps: 0.94,
        particles: 0.9,
        basin: 0.9,
      }
    case 'thinking':
      return {
        motion: 0.88,
        amplitude: 0.72,
        glow: 0.82,
        wisps: 0.84,
        particles: 0.86,
        basin: 0.78,
      }
    case 'muted':
      return {
        motion: 0.28,
        amplitude: 0.3,
        glow: 0.35,
        wisps: 0.24,
        particles: 0.25,
        basin: 0.25,
      }
    case 'idle':
    default:
      return {
        motion: 0.78,
        amplitude: 0.7,
        glow: 0.72,
        wisps: 0.74,
        particles: 0.72,
        basin: 0.7,
      }
  }
}

type OrbDrawCfg = ReturnType<typeof stateConfig>

function smoothOrbDrawCfg(prev: OrbDrawCfg, target: OrbDrawCfg, k: number): OrbDrawCfg {
  return {
    motion: prev.motion + (target.motion - prev.motion) * k,
    amplitude: prev.amplitude + (target.amplitude - prev.amplitude) * k,
    glow: prev.glow + (target.glow - prev.glow) * k,
    wisps: prev.wisps + (target.wisps - prev.wisps) * k,
    particles: prev.particles + (target.particles - prev.particles) * k,
    basin: prev.basin + (target.basin - prev.basin) * k,
  }
}

/**
 * Per-frame motion signature: multiple incommensurate time bases + asymmetry + micro-chaos
 * so states read as different movement languages, not one waveform with scaled amplitude.
 */
type OrbMotionSig = {
  tShell: number
  tFine: number
  tInner: number
  tWisp: number
  asym: number
  skew: number
  chaos: number
  breathe: number
  lift: number
  sensory: number
  project: number
  innerTurb: number
}

function computeOrbMotion(
  vs: VoiceState,
  timeAccum: number,
  organicT: number,
  tSec: number,
  audio: number
): OrbMotionSig {
  const audioCl = clamp(audio, 0, 1)
  const asymBase = Math.sin(tSec * 0.073) * 0.31 + Math.cos(tSec * 0.041) * 0.19
  const chaosRaw =
    Math.sin(tSec * 1.127) * Math.cos(tSec * 0.673) * 0.5 +
    Math.sin(tSec * 2.31 + organicT * 0.4) * 0.25 +
    Math.sin(tSec * 5.17 + organicT * 1.1) * 0.12

  switch (vs) {
    case 'idle':
      return {
        tShell: timeAccum * 0.72 + organicT * 0.18,
        tFine: timeAccum * 0.88 + organicT * 0.48,
        tInner: timeAccum * 0.62 + organicT * 0.38,
        tWisp: timeAccum * 0.78,
        asym: asymBase + Math.sin(tSec * 0.14) * 0.055,
        skew: Math.cos(tSec * 0.05) * 0.045,
        chaos: chaosRaw * 0.22,
        breathe: Math.sin(tSec * 0.31),
        lift: 0.01 + Math.sin(tSec * 0.24) * 0.022,
        sensory: 0,
        project: 0,
        innerTurb: 0.065 + Math.sin(tSec * 0.21) * 0.028,
      }
    case 'listening':
      return {
        tShell: timeAccum * 0.94 + audioCl * 0.22,
        tFine: timeAccum * 1.78 + organicT * 1.05 + audioCl * 0.38,
        tInner: timeAccum * 0.88 + organicT * 0.52 + audioCl * 0.1,
        tWisp: timeAccum * 1.12 + audioCl * 0.18,
        asym: asymBase * 1.12 + Math.sin(tSec * 0.72) * 0.09 + audioCl * 0.045,
        skew: Math.sin(tSec * 1.05) * 0.042 + audioCl * 0.022,
        chaos: chaosRaw * 0.38 + audioCl * 0.08,
        breathe: Math.sin(tSec * 0.72 + audioCl * 0.85) * 0.82,
        lift: 0.008 + audioCl * 0.022 + Math.sin(tSec * 1.05) * 0.014,
        sensory: clamp(audioCl * 0.92 + Math.sin(tSec * 4.2) * 0.022 + Math.sin(tSec * 7.1) * 0.012, 0, 1),
        project: 0,
        innerTurb: 0.095 + audioCl * 0.065,
      }
    case 'thinking':
      return {
        tShell: timeAccum * 0.68 + organicT * 0.34 + Math.sin(tSec * 0.13) * timeAccum * 0.014,
        tFine: timeAccum * 1.05 + organicT * 0.88 + Math.sin(tSec * 0.37) * 0.22,
        tInner: timeAccum * 1.12 + organicT * 0.82 + Math.sin(tSec * 0.09) * 0.42 + Math.cos(tSec * 0.19) * 0.18,
        tWisp: timeAccum * 0.76 + Math.cos(tSec * 0.26) * 0.2,
        asym: asymBase * 1.08 + Math.sin(tSec * 0.27) * 0.11 + chaosRaw * 0.06,
        skew: Math.cos(tSec * 0.076) * 0.078 + Math.sin(tSec * 0.51) * 0.038,
        chaos: chaosRaw * 0.62 + Math.sin(tSec * 0.67) * 0.09 + Math.sin(tSec * 1.31) * 0.05,
        breathe: Math.sin(tSec * 0.24) * 0.55,
        lift: 0.007 + Math.sin(tSec * 0.19) * 0.012,
        sensory: 0,
        project: 0,
        innerTurb: 0.48 + Math.sin(tSec * 0.47) * 0.14 + Math.sin(tSec * 0.89) * 0.08,
      }
    case 'speaking':
      return {
        tShell: timeAccum * 1.05 + organicT * 0.32,
        tFine: timeAccum * 1.48 + organicT * 0.55,
        tInner: timeAccum * 1.22 + organicT * 0.52,
        tWisp: timeAccum * 1.22 + Math.sin(tSec * 3.1) * 0.14,
        asym: asymBase * 0.92 + Math.sin(tSec * 0.52) * 0.055,
        skew: Math.sin(tSec * 0.78) * 0.034,
        chaos: chaosRaw * 0.32 + Math.sin(tSec * 1.05) * 0.07,
        breathe: Math.sin(tSec * 0.58) * 0.62,
        lift: 0.011 + Math.sin(tSec * 2.85) * 0.028 + audioCl * 0.018,
        sensory: 0,
        project:
          0.14 +
          0.26 * (0.5 + 0.5 * Math.sin(tSec * 2.72)) +
          0.2 * (0.5 + 0.5 * Math.sin(tSec * 4.15 + audioCl * 1.8)) +
          audioCl * 0.085,
        innerTurb: 0.16 + audioCl * 0.055,
      }
    case 'muted':
      return {
        tShell: timeAccum * 0.42 + organicT * 0.12,
        tFine: timeAccum * 0.48 + organicT * 0.25,
        tInner: timeAccum * 0.38 + organicT * 0.18,
        tWisp: timeAccum * 0.44,
        asym: asymBase * 0.45,
        skew: 0,
        chaos: chaosRaw * 0.15,
        breathe: Math.sin(tSec * 0.22) * 0.4,
        lift: 0.004,
        sensory: 0,
        project: 0,
        innerTurb: 0.03,
      }
  }
}

/**
 * State-specific shell deformation: each mode uses a different harmonic mix / kernel — not just scaled phases.
 * This is the primary "body motion" differentiator for the visible orb silhouette (membrane + core).
 */
function membraneShellDeform(
  vs: VoiceState,
  angle: number,
  latitude: number,
  indexShift: number,
  audio: number,
  cfg: ReturnType<typeof stateConfig>,
  motion: OrbMotionSig
): { radial: number; yOff: number } {
  const amp = cfg.amplitude * 0.71
  const s = motion.sensory
  const p = motion.project
  const ch = motion.chaos

  switch (vs) {
    case 'idle': {
      const w1 =
        Math.sin(angle * 2.0 + motion.tShell * 0.52 * cfg.motion + latitude * 4.9 + indexShift + motion.asym) * 0.042
      const w2 =
        Math.cos(angle * 4.0 - motion.tFine * 0.32 * cfg.motion + latitude * 3.1 + indexShift * 0.72 + motion.skew * 0.6) *
        0.019
      const w3 = Math.sin(angle * 6.0 + motion.tFine * 0.17 + latitude * 6.2 + indexShift * 1.1 + ch * 2.4) * 0.005
      const radial = 1 + (w1 + w2 + w3) * amp + audio * 0.024
      const yOff =
        Math.sin(angle * 1.55 + motion.tShell * 0.44 * cfg.motion + latitude * 5.6 + indexShift + motion.asym * 0.45) *
          0.058 *
          cfg.amplitude +
        Math.cos(angle * 2.6 - motion.tFine * 0.28 + latitude * 3.2 + indexShift) * 0.026
      return { radial, yOff }
    }
    case 'listening': {
      const w1 =
        Math.sin(angle * 2.5 + motion.tShell * 0.88 * cfg.motion + latitude * 5.1 + motion.asym) * 0.036
      const w2 =
        Math.cos(angle * 11.0 - motion.tFine * 0.62 * cfg.motion + latitude * 4.2 + indexShift * 0.95 + motion.skew) * 0.017
      const w3 =
        Math.sin(angle * 19.0 + motion.tFine * 0.62 + latitude * 7.0 + indexShift * 1.45 + ch * 4.2) * (0.009 + s * 0.018)
      const edge = Math.sin(angle * 27.0 + motion.tFine * 1.05 + indexShift * 0.4) * 0.0062 * s
      const radial = 1 + (w1 + w2 + w3 + edge) * amp + audio * (0.028 + s * 0.038)
      const yOff =
        Math.sin(angle * 2.1 + motion.tShell * 0.68 * cfg.motion + latitude * 6.0 + indexShift) * 0.068 * cfg.amplitude * (0.88 + s * 0.22) +
        Math.cos(angle * 13.0 - motion.tFine * 0.5 + latitude * 4.0) * (0.022 + s * 0.028)
      return { radial, yOff }
    }
    case 'thinking': {
      const cross =
        Math.sin(angle * 2.2 + motion.tInner * 0.48) *
        Math.sin(latitude * 3.5 + ch * 2.3 + indexShift * 0.55) *
        motion.innerTurb *
        0.14
      const w1 = Math.sin(angle * 3.0 + motion.tShell * 0.44 * cfg.motion + latitude * 5.2 + motion.asym * 0.9) * 0.032
      const w2 =
        Math.cos(angle * 5.5 - motion.tFine * 0.4 * cfg.motion + latitude * 2.85 + indexShift * 0.65) * 0.024
      const w3 = Math.sin(angle * 9.0 + motion.tInner * 0.38 + latitude * 6.8 + ch * 3.9) * 0.014
      const w4 = Math.sin(angle * 13.5 - motion.tFine * 0.22 + latitude * 5.1 + motion.tShell * 0.08) * 0.0075 * motion.innerTurb
      const wobble = Math.sin(angle * 1.1 + motion.tInner * 0.22) * Math.cos(latitude * 7.0 + motion.tShell * 0.15) * motion.innerTurb * 0.042
      const radial = 1 + (w1 + w2 + w3 + w4 + cross + wobble) * amp + audio * 0.026
      const yOff =
        Math.sin(angle * 2.4 + motion.tInner * 0.52 * cfg.motion + latitude * 5.4 + ch) * 0.062 * cfg.amplitude +
        Math.sin(angle * 4.2 - motion.tFine * 0.28 + latitude * 3.6) * 0.038 * motion.innerTurb
      return { radial, yOff }
    }
    case 'speaking': {
      const env = 1 + p * (0.06 + 0.2 * (0.5 + 0.5 * Math.sin(motion.tShell * 2.62)))
      const w1 =
        Math.sin(angle * 2.0 + motion.tShell * 1.02 * cfg.motion + latitude * 4.85 + indexShift + motion.asym) * 0.048
      const w2 =
        Math.cos(angle * 4.0 - motion.tFine * 0.55 * cfg.motion + latitude * 3.05 + indexShift * 0.68) * 0.028
      const w3 = Math.sin(angle * 7.0 + motion.tFine * 0.45 + latitude * 6.5 + ch * 2.8) * 0.012
      const lobes = Math.cos(angle * 3.0 - motion.tShell * 0.88 * cfg.motion + latitude * 2.2) * 0.03 * p
      const radial = (1 + (w1 + w2 + w3 + lobes) * amp + audio * 0.034) * env
      const yOff =
        Math.sin(angle * 1.7 + motion.tShell * 0.72 * cfg.motion + latitude * 5.5 + indexShift) * 0.072 * cfg.amplitude * (0.92 + p * 0.18) +
        Math.cos(angle * 3.0 - motion.tFine * 0.5 + latitude * 3.4) * 0.034 * (0.65 + p * 0.35)
      return { radial, yOff }
    }
    case 'muted':
    default: {
      const w1 =
        Math.sin(angle * 2.0 + motion.tShell * 0.38 * cfg.motion + latitude * 4.6 + indexShift + motion.asym * 0.5) * 0.032
      const w2 = Math.cos(angle * 3.5 - motion.tFine * 0.22 * cfg.motion + latitude * 2.9) * 0.016
      const w3 = Math.sin(angle * 5.5 + motion.tFine * 0.12 + latitude * 5.0) * 0.004
      const radial = 1 + (w1 + w2 + w3) * amp * 0.75 + audio * 0.022
      const yOff =
        Math.sin(angle * 1.4 + motion.tShell * 0.35 * cfg.motion + latitude * 4.8) * 0.042 * cfg.amplitude +
        Math.cos(angle * 2.2 - motion.tFine * 0.2 + latitude * 2.8) * 0.018
      return { radial, yOff }
    }
  }
}

function coreBodyRadialDelta(vs: VoiceState, a: number, audio: number, cfg: OrbDrawCfg, motion: OrbMotionSig): number {
  const p = motion.project
  const s = motion.sensory
  const ch = motion.chaos
  switch (vs) {
    case 'idle': {
      const n =
        Math.sin(a * 2.4 + motion.tInner * 0.55 * cfg.motion) * 0.018 +
        Math.cos(a * 4.2 - motion.tFine * 0.28 * cfg.motion + motion.skew) * 0.009 +
        Math.sin(a * 6.2 + motion.tShell * 0.15 + ch * 1.5) * 0.005
      const lb = Math.max(0, Math.sin(a + motion.asym * 0.35)) * 0.028
      return n * cfg.amplitude * 0.68 + lb + audio * 0.01 + p * 0.005
    }
    case 'listening': {
      const n =
        Math.sin(a * 3.2 + motion.tShell * 0.78 * cfg.motion) * 0.014 +
        Math.cos(a * 12.0 - motion.tFine * 0.55 * cfg.motion) * 0.011 +
        Math.sin(a * 21.0 + motion.tFine * 0.48 + ch * 2) * 0.007
      const lb = Math.max(0, Math.sin(a * 1.2 + motion.asym * 0.5)) * (0.024 + s * 0.02)
      return n * cfg.amplitude * 0.7 + lb + audio * (0.012 + s * 0.016)
    }
    case 'thinking': {
      const cross = Math.sin(a * 2.0 + motion.tInner * 0.4) * Math.sin(a * 5.5 + ch * 3) * motion.innerTurb * 0.09
      const n =
        Math.sin(a * 2.8 + motion.tInner * 0.55 * cfg.motion) * 0.016 +
        Math.cos(a * 5.0 - motion.tFine * 0.36 * cfg.motion) * 0.013 +
        Math.sin(a * 8.2 + motion.tInner * 0.32 + ch * 2.2) * 0.009 +
        cross
      const lb = Math.max(0, Math.sin(a + motion.asym * 0.45)) * (0.028 + motion.innerTurb * 0.048)
      return n * cfg.amplitude * 0.72 + lb + audio * 0.011
    }
    case 'speaking': {
      const env = 1 + p * (0.08 + 0.22 * (0.5 + 0.5 * Math.sin(motion.tShell * 2.48)))
      const n =
        Math.sin(a * 2.0 + motion.tShell * 0.88 * cfg.motion + motion.asym) * 0.02 +
        Math.cos(a * 4.0 - motion.tFine * 0.48 * cfg.motion) * 0.013 +
        Math.sin(a * 6.5 + motion.tShell * 0.22) * 0.007 +
        Math.cos(a * 3.0 - motion.tShell * 0.75 * cfg.motion) * 0.014 * p
      const lb = Math.max(0, Math.sin(a + motion.asym * 0.3)) * (0.032 + p * 0.032)
      return (n * cfg.amplitude * 0.72 + lb + audio * 0.014 + p * 0.01) * env
    }
    case 'muted':
    default: {
      const n =
        Math.sin(a * 2.0 + motion.tInner * 0.35 * cfg.motion) * 0.014 +
        Math.cos(a * 3.5 - motion.tFine * 0.18 * cfg.motion) * 0.008
      const lb = Math.max(0, Math.sin(a + motion.asym * 0.2)) * 0.02
      return n * cfg.amplitude * 0.65 + lb + audio * 0.008
    }
  }
}

function coreBodyVerticalScale(vs: VoiceState, motion: OrbMotionSig): number {
  switch (vs) {
    case 'idle':
      return 0.965 + motion.skew * 0.028
    case 'listening':
      return 0.952 + motion.skew * 0.04 + motion.sensory * 0.018
    case 'thinking':
      return 0.942 + motion.skew * 0.055
    case 'speaking':
      return 0.968 + motion.skew * 0.028 + motion.project * 0.022
    case 'muted':
    default:
      return 0.96 + motion.skew * 0.02
  }
}

function LivingOrbVisualizerInner({
  state,
  audioLevel = 0.1,
  className,
  micLevelRef,
  orbContextRef,
  orbOutputLevelRef,
}: LivingOrbVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderRef = useRef<number>()
  const stateRef = useRef<VoiceState>(state)
  const audioRef = useRef(audioLevel)
  const timeRef = useRef(0)
  const smoothAudioRef = useRef(0.1)
  const micSmoothedRef = useRef(0)
  const orbEnergyRef = useRef(0.06)
  const organicTRef = useRef(0)
  const particlesRef = useRef<Particle[]>([])
  const mobileLikeCachedRef = useRef(false)
  const smoothedDrawCfgRef = useRef<OrbDrawCfg | null>(null)
  const moodRef = useRef<OrbMood | null>(null)

  // Canvas drawing state
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const widthRef = useRef(0)
  const heightRef = useRef(0)
  const dprRef = useRef(1)
  const qualityRef = useRef(1)
  const lastFrameRef = useRef(performance.now())

  const useRefDrive = Boolean(micLevelRef && orbContextRef)

  // Update state and audio refs when props change (prop-driven mode only for audio)
  useEffect(() => {
    stateRef.current = state
    if (!useRefDrive) {
      audioRef.current = clamp(audioLevel, 0, 1)
    }
  }, [state, audioLevel, useRefDrive])

  // Metrics calculations (mobile flag cached on resize — avoids DOM UA sniff every call)
  const orbMetrics = useCallback(() => {
    const shortSide = Math.min(widthRef.current, heightRef.current)
    const r = shortSide * (mobileLikeCachedRef.current ? 0.22 : 0.26)

    return {
      cx: widthRef.current * 0.5,
      cy: heightRef.current * 0.44,
      r,
    }
  }, [])

  // Compute quality based on device
  const computeQuality = useCallback(() => {
    const mobile = isMobileLike()
    mobileLikeCachedRef.current = mobile
    const shortSide = Math.min(window.innerWidth, window.innerHeight)

    if (mobile) {
      qualityRef.current = shortSide < 420 ? 0.68 : 0.8
    } else {
      qualityRef.current = shortSide < 700 ? 0.9 : 1
    }

    dprRef.current = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2)
  }, [])

  // Rebuild particles array (declared before resize so resize can call it safely)
  const rebuildParticles = useCallback(() => {
    const count = Math.floor((mobileLikeCachedRef.current ? 52 : 88) * qualityRef.current)
    particlesRef.current = Array.from({ length: count }, (_, i) => ({
      angle: Math.random() * Math.PI * 2,
      radius: 0.48 + Math.random() * 0.56,
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.8,
      size: 0.6 + Math.random() * 1.4,
      band: i % 3,
    }))
  }, [])

  // Resize canvas
  const resize = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    computeQuality()

    const w = window.innerWidth
    const h = window.innerHeight

    canvas.width = Math.floor(w * dprRef.current)
    canvas.height = Math.floor(h * dprRef.current)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`

    if (ctxRef.current) {
      ctxRef.current.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0)
    }

    widthRef.current = w
    heightRef.current = h

    rebuildParticles()
  }, [computeQuality, rebuildParticles])

  // Draw functions
  const clearFrame = useCallback(() => {
    const ctx = ctxRef.current
    const canvas = canvasRef.current
    if (!ctx || !canvas) return

    const width = canvas.width
    const height = canvas.height

    ctx.clearRect(0, 0, width, height)

    const g = ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      0,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.58
    )
    g.addColorStop(0, rgba(HERO.bg2, 0.22))
    g.addColorStop(0.38, rgba(HERO.bg, 0.12))
    g.addColorStop(1, 'rgba(0, 0, 0, 1)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, width, height)
  }, [])

  const drawAtmosphericGlow = useCallback(
    (motion: OrbMotionSig, audio: number, cfg: ReturnType<typeof stateConfig>, mood: OrbMood) => {
      if (!ctxRef.current) return

      const ctx = ctxRef.current
      const { cx, cy, r } = orbMetrics()
      const gt = mood.glowTight
      const breath =
        1 +
        motion.breathe * motion.lift * 0.72 +
        audio * (0.018 + motion.sensory * 0.014) +
        motion.project * 0.02
      const gMul = cfg.glow * (0.86 + audio * 0.06 + motion.project * 0.04)

      const innerR = r * (0.05 * breath * gt) + r * (0.58 * breath * gt)
      const gIn = ctx.createRadialGradient(cx, cy, r * 0.04 * breath * gt, cx, cy, innerR)
      gIn.addColorStop(0, rgba(mood.glowInner, (mood.glowInnerA * gMul + audio * 0.055) * 1.02))
      gIn.addColorStop(0.55, rgba(mood.glowMid, mood.glowMidA * gMul * 0.88))
      gIn.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = gIn
      ctx.beginPath()
      ctx.arc(cx, cy, innerR, 0, Math.PI * 2)
      ctx.fill()

      const midOuter = r * (0.98 * breath * gt)
      const gMid = ctx.createRadialGradient(cx, cy, r * 0.2 * breath * gt, cx, cy, midOuter)
      gMid.addColorStop(0, rgba(mood.glowMid, mood.glowMidA * gMul + audio * 0.032))
      gMid.addColorStop(0.5, rgba(mood.glowOuter, mood.glowOuterA * gMul * 1.05))
      gMid.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = gMid
      ctx.beginPath()
      ctx.arc(cx, cy, midOuter, 0, Math.PI * 2)
      ctx.fill()

      const gOut = ctx.createRadialGradient(cx, cy, r * 0.42 * breath * gt, cx, cy, r * (1.28 * gt))
      gOut.addColorStop(0, rgba(mood.glowOuter, 0.055 * gMul + audio * 0.025))
      gOut.addColorStop(0.45, rgba(mood.glowOuter, 0.03 * gMul))
      gOut.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = gOut
      ctx.beginPath()
      ctx.arc(cx, cy, r * (1.32 * gt), 0, Math.PI * 2)
      ctx.fill()

      const gLift = ctx.createRadialGradient(cx, cy + r * 0.26, 0, cx, cy + r * 0.26, r * 0.88 * breath * gt)
      gLift.addColorStop(0, rgba(mood.glowOuter, 0.085 * gMul + audio * 0.022))
      gLift.addColorStop(0.55, rgba(mood.glowMid, 0.055 * gMul))
      gLift.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = gLift
      ctx.beginPath()
      ctx.arc(cx, cy + r * 0.26, r * 0.9 * breath * gt, 0, Math.PI * 2)
      ctx.fill()
    },
    [orbMetrics]
  )

  const drawCoreBody = useCallback(
    (motion: OrbMotionSig, audio: number, cfg: OrbDrawCfg, mood: OrbMood, voiceState: VoiceState) => {
      if (!ctxRef.current) return

      const ctx = ctxRef.current
      const { cx, cy, r } = orbMetrics()

      ctx.save()
      ctx.translate(cx, cy)

      const sx =
        1 + Math.sin(motion.tShell * 0.52 + motion.asym) * (0.008 + motion.project * 0.012) + motion.skew * 0.028
      const sy =
        1 +
        Math.cos(motion.tInner * 0.66) * (0.014 + motion.project * 0.018) +
        audio * 0.007 +
        motion.project * 0.014
      ctx.scale(sx, sy)

      const g = ctx.createRadialGradient(0, -r * 0.18, r * 0.08, 0, 0, r * 1.08)
      g.addColorStop(0, rgba(mood.coreTint, 0.88))
      g.addColorStop(0.58, rgba(HERO.bg2, 0.92))
      g.addColorStop(0.84, rgba(HERO.bg, 0.76))
      g.addColorStop(1, 'rgba(0,0,0,0)')

      ctx.fillStyle = g
      ctx.beginPath()

      const steps = Math.floor(160 * qualityRef.current)
      const yScale = coreBodyVerticalScale(voiceState, motion)

      for (let i = 0; i <= steps; i++) {
        const u = i / steps
        const a = u * Math.PI * 2 + motion.asym * 0.12

        const radialDelta = coreBodyRadialDelta(voiceState, a, audio, cfg, motion)
        const radius = r * (1 + radialDelta)

        const x = Math.cos(a) * radius
        const y = Math.sin(a) * radius * yScale

        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }

      ctx.closePath()
      ctx.fill()
      ctx.restore()
    },
    [orbMetrics]
  )

  const membranePoint = useCallback(
    (
      voiceState: VoiceState,
      angle: number,
      latitude: number,
      indexShift: number,
      audio: number,
      cfg: OrbDrawCfg,
      motion: OrbMotionSig
    ) => {
      const { cx, cy, r } = orbMetrics()

      const latScale = Math.cos(latitude)
      const baseX = Math.cos(angle + motion.asym * 0.08) * r * latScale
      const baseY = Math.sin(latitude) * r * (0.97 + motion.skew * 0.04)

      const { radial, yOff } = membraneShellDeform(voiceState, angle, latitude, indexShift, audio, cfg, motion)

      const x = cx + baseX * radial
      const y = cy + baseY + yOff * r

      return { x, y }
    },
    [orbMetrics]
  )

  const drawMembrane = useCallback(
    (motion: OrbMotionSig, audio: number, cfg: ReturnType<typeof stateConfig>, voiceState: VoiceState, mood: OrbMood) => {
      if (!ctxRef.current) return

      const ctx = ctxRef.current
      const ribbonCount = Math.floor((mobileLikeCachedRef.current ? 64 : 92) * qualityRef.current)
      const segs = Math.floor((mobileLikeCachedRef.current ? 120 : 170) * qualityRef.current)

      ctx.save()
      ctx.globalCompositeOperation = 'lighter'

      for (let i = 0; i < ribbonCount; i++) {
        const v = i / Math.max(1, ribbonCount - 1)
        const latitude = (v - 0.5) * Math.PI * 0.94
        const centerWeight = 1 - Math.abs(v - 0.5) * 1.5
        const upperWeight = smoothstep(0.55, 1.0, v)

        const alpha =
          (0.072 + centerWeight * 0.17 + upperWeight * 0.08) *
          mood.lineAlphaMul *
          (1.0 + cfg.glow * 0.75)

        const lineWidth = (0.92 + centerWeight * 1.35) * (mobileLikeCachedRef.current ? 1.02 : 1.14)

        ctx.beginPath()

        for (let j = 0; j <= segs; j++) {
          const u = j / segs
          const angle = u * Math.PI * 2 + motion.asym * (0.04 + v * 0.06)
          const p = membranePoint(voiceState, angle, latitude, i * 0.03, audio, cfg, motion)

          if (j === 0) ctx.moveTo(p.x, p.y)
          else ctx.lineTo(p.x, p.y)
        }

        const hueDrift = Math.sin(motion.tFine * 0.12 + i * 0.1 + motion.chaos * 2) * 5
        const { h, s, l } = lineHueBand(mood, v, hueDrift, voiceState)

        ctx.strokeStyle = hsla(h, s, l, alpha)
        ctx.lineWidth = lineWidth
        ctx.stroke()
      }

      ctx.restore()
    },
    [membranePoint]
  )

  const drawInteriorSheets = useCallback(
    (motion: OrbMotionSig, audio: number, cfg: ReturnType<typeof stateConfig>, mood: OrbMood) => {
      if (!ctxRef.current) return

      const ctx = ctxRef.current
      const { cx, cy, r } = orbMetrics()
      const layers = Math.floor((mobileLikeCachedRef.current ? 10 : 16) * qualityRef.current)

      ctx.save()
      ctx.globalCompositeOperation = 'lighter'

      for (let layer = 0; layer < layers; layer++) {
        const lt = layer / Math.max(1, layers - 1)
        const alpha = (0.065 + lt * 0.078) * cfg.glow * (mood.lineAlphaMul * 0.82)
        const hue =
          mood.interiorHue + lt * 12 + Math.sin(motion.tInner * 0.15 + layer * 0.38 + motion.chaos) * 4
        const sat = mood.interiorSat
        const light = mood.interiorLight + lt * 4

        ctx.beginPath()

        const start = -Math.PI * 0.08
        const end = Math.PI * 1.08
        const steps = Math.floor((mobileLikeCachedRef.current ? 70 : 110) * qualityRef.current)

        for (let i = 0; i <= steps; i++) {
          const u = i / steps
          const a = start + (end - start) * u + motion.asym * 0.11

          const turb = motion.innerTurb * (0.85 + lt * 0.35)
          const shell =
            r * (0.7 + lt * 0.38) +
            Math.sin(a * 3.0 + motion.tInner * 0.68 * cfg.motion + motion.chaos * 1.2) * r * (0.028 + turb * 0.05) +
            Math.cos(a * 5.0 - motion.tFine * 0.35 + layer * 0.32 + motion.skew * 1.4) * r * (0.016 + turb * 0.028)

          const x =
            cx +
            Math.cos(a) * shell * (0.81 + lt * 0.2) +
            Math.sin(motion.tShell * 0.38 + layer * 0.22 + motion.chaos) * r * 0.014

          const y =
            cy +
            Math.sin(a) * shell * (0.41 + lt * 0.11) +
            Math.sin(a * 1.65 + motion.tInner * 0.55 + layer * 0.6 + motion.asym) * r * (0.048 + motion.innerTurb * 0.038) +
            audio * r * 0.012

          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }

        ctx.strokeStyle = hsla(hue, sat, light, alpha)
        ctx.lineWidth = 1.0 + lt * 1.1
        ctx.stroke()
      }

      ctx.restore()
    },
    [orbMetrics]
  )

  const drawLowerEnergy = useCallback(
    (motion: OrbMotionSig, audio: number, cfg: ReturnType<typeof stateConfig>, voiceState: VoiceState, mood: OrbMood) => {
      if (!ctxRef.current) return

      const ctx = ctxRef.current
      const { cx, cy, r } = orbMetrics()
      const bands = Math.floor((mobileLikeCachedRef.current ? 14 : 22) * qualityRef.current)

      ctx.save()
      ctx.globalCompositeOperation = 'lighter'

      for (let i = 0; i < bands; i++) {
        const alpha = (0.052 + i * 0.007) * cfg.basin * mood.lineAlphaMul * 0.85
        const yBase = cy + r * (0.17 + i * 0.015)
        const amp = r * (0.024 + i * 0.0018)

        ctx.beginPath()

        const steps = Math.floor((mobileLikeCachedRef.current ? 60 : 90) * qualityRef.current)
        for (let j = 0; j <= steps; j++) {
          const u = j / steps
          const x = cx - r * 0.76 + u * r * 1.52
          const y =
            yBase +
            Math.sin(u * Math.PI * 2 + motion.tFine * 0.85 * cfg.motion + i * 0.2 + motion.asym) * amp +
            Math.cos(u * Math.PI * 5.2 - motion.tShell * 0.34 + i * 0.15 + motion.chaos) * amp * (0.44 + motion.sensory * 0.12) -
            audio * r * 0.014 -
            motion.project * r * 0.011 * Math.sin(u * Math.PI * 4 + motion.tWisp * 0.4)

          if (j === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }

        const hue = mood.shellHue + i * 0.55
        const sat = voiceState === 'muted' ? mood.shellSat : mood.shellSat - 6
        const light = mood.shellLight - 4
        ctx.strokeStyle = hsla(hue, sat, light, alpha)
        ctx.lineWidth = 1.4 + i * 0.07
        ctx.stroke()
      }

      ctx.restore()
    },
    [orbMetrics]
  )

  const drawWisps = useCallback(
    (motion: OrbMotionSig, audio: number, cfg: ReturnType<typeof stateConfig>, voiceState: VoiceState, mood: OrbMood) => {
      if (!ctxRef.current) return

      const ctx = ctxRef.current
      const { cx, cy, r } = orbMetrics()
      const wispCount = Math.floor((mobileLikeCachedRef.current ? 10 : 16) * qualityRef.current)

      ctx.save()
      ctx.globalCompositeOperation = 'lighter'

      for (let i = 0; i < wispCount; i++) {
        const side = i % 2 === 0 ? -1 : 1
        const seed = i * 0.32
        const alpha = (0.075 + (1 - i / wispCount) * 0.06) * cfg.wisps * mood.lineAlphaMul * 0.9
        const hue = mood.shellHue + i * 1.0 + Math.sin(motion.tWisp * 0.11 + i + motion.chaos) * 5
        const sat = voiceState === 'muted' ? mood.shellSat : mood.shellSat - 4
        const light = mood.shellLight + 2

        ctx.beginPath()

        const steps = Math.floor((mobileLikeCachedRef.current ? 55 : 85) * qualityRef.current)
        for (let j = 0; j <= steps; j++) {
          const u = j / steps
          const lift = u * r * (0.9 + (i % 5) * 0.055)

          const bend =
            Math.sin(u * 4.1 + motion.tWisp * 0.66 * cfg.motion + seed + motion.asym) * r * (0.12 + motion.innerTurb * 0.045) +
            Math.cos(u * 8.0 - motion.tFine * 0.28 + seed + motion.skew) * r * 0.038

          const flutter =
            Math.sin(u * 13 + motion.tFine * 1.05 * cfg.motion + seed) * r * 0.014 * (1 - u) +
            audio * r * 0.032 * (1 - u * 0.75) +
            motion.sensory * r * 0.028 * Math.sin(u * 22 + motion.tFine * 1.4) * (1 - u) +
            motion.project * r * 0.042 * Math.sin(u * 9 + motion.tWisp * 0.9) * (1 - u * 0.5)

          const x =
            cx +
            side * r * (0.18 + i * 0.011 + motion.skew * 0.02) +
            bend * side +
            flutter * side

          const y =
            cy -
            r * 0.72 -
            lift +
            Math.sin(u * 5.0 + motion.tWisp * 0.72 + seed + motion.chaos * 0.5) * r * 0.026

          if (j === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }

        ctx.strokeStyle = hsla(hue, sat, light, alpha)
        ctx.lineWidth = 1.3 + (1 - i / wispCount) * 1.4
        ctx.stroke()
      }

      ctx.restore()
    },
    [orbMetrics]
  )

  const drawParticles = useCallback(
    (motion: OrbMotionSig, audio: number, cfg: OrbDrawCfg, voiceState: VoiceState, mood: OrbMood) => {
      if (!ctxRef.current) return

      const ctx = ctxRef.current
      const { cx, cy, r } = orbMetrics()

      ctx.save()
      ctx.globalCompositeOperation = 'lighter'

      const gatherBreath = mood.ptGather * (0.12 + 0.08 * Math.sin(motion.tShell * mood.ptPulse * 1.1))
      const stateMul = cfg.particles

      for (const p of particlesRef.current) {
        const drift =
          motion.tShell * 0.13 * p.speed * stateMul * mood.ptDrift +
          Math.sin(motion.tShell * 0.17 + p.phase) * 0.28 * mood.ptDrift +
          Math.sin(motion.tFine * 0.31 + p.phase * 1.7) * 0.22 * mood.ptDrift +
          motion.sensory * 0.24 * Math.sin(motion.tFine * 0.55 + p.phase * 2.4) * mood.ptDrift +
          motion.innerTurb * 0.32 * Math.sin(motion.tInner * 0.41 + p.phase * 3.1 + motion.chaos)

        const a = p.angle + drift + motion.asym * 0.08
        const radialBase =
          r * p.radius * (1 - gatherBreath) +
          Math.sin(motion.tShell * 0.38 + p.phase) * r * 0.03 * mood.ptDrift +
          motion.project * r * 0.034 * Math.sin(motion.tFine * 0.62 + p.phase)
        const rr = radialBase * (0.62 + 0.055 * Math.sin(motion.tShell * mood.ptPulse + p.phase * 2) + motion.project * 0.038)

        const sway =
          Math.cos(motion.tInner * 0.19 + p.phase) * r * 0.028 * mood.ptDrift +
          motion.innerTurb * r * 0.018 * Math.sin(p.phase * 1.3 + motion.chaos * 2)
        const lift =
          Math.sin(motion.tShell * 0.23 + p.band * 0.9) * r * 0.018 * mood.ptDrift +
          motion.sensory * r * 0.014 * Math.sin(motion.tFine * 1.1 + p.band)

        const x = cx + Math.cos(a) * rr * 0.66 + sway
        const y = cy + Math.sin(a * 1.2 + p.phase + motion.skew * 0.15) * rr * 0.29 + lift

        const pulse =
          1 +
          Math.sin(motion.tShell * mood.ptPulse * 1.65 + p.phase) * 0.085 +
          audio * 0.12 +
          mood.ptGather * 0.05 +
          motion.project * 0.055
        const bandJitter = Math.sin(motion.tFine * 0.12 + p.band * 2.1 + motion.chaos) * 5
        const ph = mood.particleHue + p.band * 2.1 + bandJitter
        const ps = mood.particleSat + p.band * 2
        const pl = mood.particleLight + audio * 4.5

        const alphaBase = mood.particleAlpha * stateMul * pulse
        const alpha = voiceState === 'muted' ? alphaBase * 0.9 : alphaBase

        ctx.fillStyle = hsla(ph, ps, pl, alpha)

        const size =
          p.size * mood.particleSize * (0.9 + p.band * 0.06) +
          audio * 0.95 * mood.particleSize * 0.32 +
          motion.project * mood.particleSize * 0.28
        ctx.beginPath()
        ctx.arc(x, y, size, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.restore()
    },
    [orbMetrics]
  )

  const drawVignette = useCallback(() => {
    if (!ctxRef.current) return

    const ctx = ctxRef.current
    const g = ctx.createRadialGradient(
      widthRef.current * 0.5,
      heightRef.current * 0.5,
      Math.min(widthRef.current, heightRef.current) * 0.18,
      widthRef.current * 0.5,
      heightRef.current * 0.5,
      Math.max(widthRef.current, heightRef.current) * 0.72
    )
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,0.32)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, widthRef.current, heightRef.current)
  }, [])

  // Main render loop
  const render = useCallback((now: number) => {
    if (!ctxRef.current || !canvasRef.current) return

    renderRef.current = requestAnimationFrame(render)

    const dt = Math.min((now - lastFrameRef.current) / 1000, 0.033)
    lastFrameRef.current = now

    const tSec = now * 0.001
    timeRef.current += dt
    const vs = stateRef.current
    let organicRate = 0.85 + Math.sin(tSec * 0.31) * 0.04
    if (vs === 'idle') organicRate *= 0.92
    else if (vs === 'listening') organicRate *= 1.02
    else if (vs === 'thinking') organicRate *= 0.82
    else if (vs === 'speaking') organicRate *= 1.03
    else if (vs === 'muted') organicRate *= 0.48
    organicTRef.current += dt * organicRate

    const ctxOrb = orbContextRef?.current
    const sc = ctxOrb?.socketConnected ?? true
    const mm = ctxOrb?.micMuted ?? false

    if (useRefDrive && micLevelRef) {
      const rawMic = clamp(micLevelRef.current, 0, 1)
      const micTarget = mm ? 0 : rawMic
      const follow = mm ? 0.2 : micTarget > micSmoothedRef.current ? 0.42 : 0.14
      micSmoothedRef.current += (micTarget - micSmoothedRef.current) * follow
      let target = orbLevelFromState(vs, micSmoothedRef.current, sc, mm)
      if (vs === 'speaking') {
        const env = 0.42 + 0.12 * (0.5 + 0.5 * Math.sin(tSec * 2.55))
        target = Math.max(target, audioLevelMinForVoiceState(vs) + env * 0.22)
      }
      target = clamp(target, 0, 1)
      orbEnergyRef.current = smoothOrbDisplayEnergy(orbEnergyRef.current, target)
      smoothAudioRef.current = orbEnergyRef.current
    } else {
      smoothAudioRef.current = lerp(smoothAudioRef.current, audioRef.current, 0.08)
    }

    if (orbOutputLevelRef) {
      orbOutputLevelRef.current = smoothAudioRef.current
    }

    const targetCfg = stateConfig(vs)
    if (!smoothedDrawCfgRef.current) {
      smoothedDrawCfgRef.current = { ...targetCfg }
    }
    smoothedDrawCfgRef.current = smoothOrbDrawCfg(smoothedDrawCfgRef.current, targetCfg, 0.078)
    const cfg = smoothedDrawCfgRef.current

    const targetMood = moodTargetForState(vs)
    if (!moodRef.current) {
      moodRef.current = moodTargetForState(vs)
    }
    moodRef.current = smoothMood(moodRef.current, targetMood, 0.052)
    const mood = moodRef.current

    const motion = computeOrbMotion(vs, timeRef.current, organicTRef.current, tSec, smoothAudioRef.current)

    clearFrame()
    drawAtmosphericGlow(motion, smoothAudioRef.current, cfg, mood)
    drawLowerEnergy(motion, smoothAudioRef.current, cfg, vs, mood)
    drawCoreBody(motion, smoothAudioRef.current, cfg, mood, vs)
    drawInteriorSheets(motion, smoothAudioRef.current, cfg, mood)
    drawMembrane(motion, smoothAudioRef.current, cfg, vs, mood)
    drawWisps(motion, smoothAudioRef.current, cfg, vs, mood)
    drawParticles(motion, smoothAudioRef.current, cfg, vs, mood)
    drawVignette()
  }, [
    clearFrame,
    drawAtmosphericGlow,
    drawLowerEnergy,
    drawCoreBody,
    drawInteriorSheets,
    drawMembrane,
    drawWisps,
    drawParticles,
    drawVignette,
    useRefDrive,
    micLevelRef,
    orbContextRef,
    orbOutputLevelRef,
  ])

  // Initialize canvas and start render loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    ctxRef.current = ctx
    resize()

    // Start render loop
    lastFrameRef.current = performance.now()
    renderRef.current = requestAnimationFrame(render)

    return () => {
      if (renderRef.current != null) {
        cancelAnimationFrame(renderRef.current)
        renderRef.current = undefined
      }
      ctxRef.current = null
    }
  }, [render, resize])

  // Handle window resize
  useEffect(() => {
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [resize])

  return (
    <canvas
      ref={canvasRef}
      className={cn('fixed inset-0 w-full h-full', className)}
      style={{ display: 'block', touchAction: 'none', pointerEvents: 'none' }}
    />
  )
}

const LivingOrbVisualizer = memo(LivingOrbVisualizerInner)
export default LivingOrbVisualizer
