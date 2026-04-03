'use client'

import { useEffect, useRef, useCallback, useState } from 'react'

export type VoiceState = 'idle' | 'listening' | 'speaking' | 'thinking' | 'muted'

interface LivingOrbVisualizerProps {
  state: VoiceState
  audioLevel?: number
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

function stateConfig(state: VoiceState) {
  switch (state) {
    case 'listening':
      return {
        motion: 0.95,
        amplitude: 0.95,
        glow: 0.92,
        wisps: 0.95,
        particles: 0.92,
        basin: 0.95,
      }
    case 'speaking':
      return {
        motion: 1.25,
        amplitude: 1.25,
        glow: 1.15,
        wisps: 1.2,
        particles: 1.05,
        basin: 1.18,
      }
    case 'thinking':
      return {
        motion: 0.68,
        amplitude: 0.76,
        glow: 0.8,
        wisps: 0.72,
        particles: 0.75,
        basin: 0.7,
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
        amplitude: 0.68,
        glow: 0.68,
        wisps: 0.68,
        particles: 0.68,
        basin: 0.66,
      }
  }
}

export default function LivingOrbVisualizer({ state, audioLevel = 0.1 }: LivingOrbVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderRef = useRef<number>()
  const stateRef = useRef<VoiceState>(state)
  const audioRef = useRef(audioLevel)
  const timeRef = useRef(0)
  const smoothAudioRef = useRef(0.1)
  const particlesRef = useRef<Particle[]>([])
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

  // Canvas drawing state
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const widthRef = useRef(0)
  const heightRef = useRef(0)
  const dprRef = useRef(1)
  const qualityRef = useRef(1)
  const lastFrameRef = useRef(performance.now())

  // Update state and audio refs when props change
  useEffect(() => {
    stateRef.current = state
    audioRef.current = clamp(audioLevel, 0, 1)
  }, [state, audioLevel])

  // Metrics calculations
  const orbMetrics = useCallback(() => {
    const shortSide = Math.min(widthRef.current, heightRef.current)
    const r = shortSide * (isMobileLike() ? 0.22 : 0.26)

    return {
      cx: widthRef.current * 0.5,
      cy: heightRef.current * 0.44,
      r,
    }
  }, [])

  // Compute quality based on device
  const computeQuality = useCallback(() => {
    const mobile = isMobileLike()
    const shortSide = Math.min(window.innerWidth, window.innerHeight)

    if (mobile) {
      qualityRef.current = shortSide < 420 ? 0.68 : 0.8
    } else {
      qualityRef.current = shortSide < 700 ? 0.9 : 1
    }

    dprRef.current = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2)
  }, [])

  // Resize canvas
  const resize = useCallback(() => {
    if (!canvasRef.current) return

    computeQuality()

    const w = window.innerWidth
    const h = window.innerHeight

    canvasRef.current.width = Math.floor(w * dprRef.current)
    canvasRef.current.height = Math.floor(h * dprRef.current)
    canvasRef.current.style.width = `${w}px`
    canvasRef.current.style.height = `${h}px`

    if (ctxRef.current) {
      ctxRef.current.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0)
    }

    widthRef.current = w
    heightRef.current = h

    rebuildParticles()
  }, [computeQuality])

  // Rebuild particles array
  const rebuildParticles = useCallback(() => {
    const count = Math.floor((isMobileLike() ? 52 : 88) * qualityRef.current)
    particlesRef.current = Array.from({ length: count }, (_, i) => ({
      angle: Math.random() * Math.PI * 2,
      radius: 0.48 + Math.random() * 0.56,
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.8,
      size: 0.6 + Math.random() * 1.4,
      band: i % 3,
    }))
  }, [])

  // Draw functions
  const clearFrame = useCallback(() => {
    if (!ctxRef.current) return

    const ctx = ctxRef.current
    const { width, height } = canvasRef.current as HTMLCanvasElement

    ctx.clearRect(0, 0, width, height)

    const g = ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      0,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.72
    )
    g.addColorStop(0, 'rgba(4, 10, 14, 0.16)')
    g.addColorStop(0.32, 'rgba(2, 4, 7, 0.08)')
    g.addColorStop(1, 'rgba(0, 0, 0, 1)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, width, height)
  }, [])

  const drawAtmosphericGlow = useCallback(
    (t: number, audio: number, cfg: ReturnType<typeof stateConfig>) => {
      if (!ctxRef.current) return

      const ctx = ctxRef.current
      const { cx, cy, r } = orbMetrics()
      const breath = 1 + Math.sin(t * 1.25) * 0.02 + audio * 0.06

      const g1 = ctx.createRadialGradient(cx, cy, r * 0.08, cx, cy, r * 2.2 * breath)
      g1.addColorStop(0, `rgba(180,255,220,${0.28 * cfg.glow + audio * 0.25})`)
      g1.addColorStop(0.35, `rgba(120,245,255,${0.22 * cfg.glow + audio * 0.18})`)
      g1.addColorStop(0.65, `rgba(100,180,255,${0.12 * cfg.glow})`)
      g1.addColorStop(1, 'rgba(0,0,0,0)')

      ctx.fillStyle = g1
      ctx.beginPath()
      ctx.arc(cx, cy, r * 2.4 * breath, 0, Math.PI * 2)
      ctx.fill()

      const g2 = ctx.createRadialGradient(cx, cy + r * 0.28, 0, cx, cy + r * 0.28, r * 1.5)
      g2.addColorStop(0, `rgba(200,255,160,${0.26 * cfg.glow + audio * 0.18})`)
      g2.addColorStop(0.45, `rgba(140,255,220,${0.16 * cfg.glow})`)
      g2.addColorStop(1, 'rgba(0,0,0,0)')

      ctx.fillStyle = g2
      ctx.beginPath()
      ctx.arc(cx, cy + r * 0.28, r * 1.45, 0, Math.PI * 2)
      ctx.fill()
    },
    [orbMetrics]
  )

  const drawCoreBody = useCallback(
    (t: number, audio: number, cfg: ReturnType<typeof stateConfig>) => {
      if (!ctxRef.current) return

      const ctx = ctxRef.current
      const { cx, cy, r } = orbMetrics()

      ctx.save()
      ctx.translate(cx, cy)

      const sx = 1 + Math.sin(t * 0.52) * 0.018
      const sy = 1 + Math.cos(t * 0.66) * 0.035 + audio * 0.015
      ctx.scale(sx, sy)

      const g = ctx.createRadialGradient(0, -r * 0.18, r * 0.08, 0, 0, r * 1.08)
      g.addColorStop(0, 'rgba(8,16,20,0.88)')
      g.addColorStop(0.58, 'rgba(6,12,15,0.93)')
      g.addColorStop(0.84, 'rgba(2,4,5,0.74)')
      g.addColorStop(1, 'rgba(0,0,0,0)')

      ctx.fillStyle = g
      ctx.beginPath()

      const steps = Math.floor(160 * qualityRef.current)

      for (let i = 0; i <= steps; i++) {
        const u = i / steps
        const a = u * Math.PI * 2

        const noise =
          Math.sin(a * 2.5 + t * 0.72 * cfg.motion) * 0.04 +
          Math.cos(a * 4.7 - t * 0.34 * cfg.motion) * 0.021 +
          Math.sin(a * 6.8 + t * 0.18) * 0.012

        const lowerBulge = Math.max(0, Math.sin(a)) * 0.082
        const radius = r * (1 + noise * cfg.amplitude + lowerBulge + audio * 0.024)

        const x = Math.cos(a) * radius
        const y = Math.sin(a) * radius * 0.95

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
    (angle: number, latitude: number, indexShift: number, t: number, audio: number, cfg: ReturnType<typeof stateConfig>) => {
      const { cx, cy, r } = orbMetrics()

      const latScale = Math.cos(latitude)
      const baseX = Math.cos(angle) * r * latScale
      const baseY = Math.sin(latitude) * r * 0.97

      const wave1 = Math.sin(angle * 2.0 + t * 0.8 * cfg.motion + latitude * 4.9 + indexShift) * 0.11
      const wave2 = Math.cos(angle * 4.0 - t * 0.45 * cfg.motion + latitude * 3.1 + indexShift * 0.7) * 0.055
      const wave3 = Math.sin(angle * 7.0 + t * 0.2 + latitude * 6.6 + indexShift * 1.15) * 0.018

      const radial = 1 + (wave1 + wave2 + wave3) * cfg.amplitude + audio * 0.07

      const x = cx + baseX * radial
      const y =
        cy +
        baseY +
        Math.sin(angle * 1.65 + t * 0.6 * cfg.motion + latitude * 5.8 + indexShift) * r * 0.07 * cfg.amplitude +
        Math.cos(angle * 2.8 - t * 0.38 + latitude * 3.3 + indexShift) * r * 0.03

      return { x, y }
    },
    [orbMetrics]
  )

  const drawMembrane = useCallback(
    (t: number, audio: number, cfg: ReturnType<typeof stateConfig>) => {
      if (!ctxRef.current) return

      const ctx = ctxRef.current
      const ribbonCount = Math.floor((isMobileLike() ? 64 : 92) * qualityRef.current)
      const segs = Math.floor((isMobileLike() ? 120 : 170) * qualityRef.current)

      ctx.save()
      ctx.globalCompositeOperation = 'lighter'

      for (let i = 0; i < ribbonCount; i++) {
        const v = i / Math.max(1, ribbonCount - 1)
        const latitude = (v - 0.5) * Math.PI * 0.94
        const centerWeight = 1 - Math.abs(v - 0.5) * 1.5
        const upperWeight = smoothstep(0.55, 1.0, v)

        const alpha =
          (0.055 + centerWeight * 0.14 + upperWeight * 0.06) *
          (1.0 + cfg.glow * 0.8)

        const lineWidth = (0.85 + centerWeight * 1.2) * (isMobileLike() ? 1.0 : 1.1)

        ctx.beginPath()

        for (let j = 0; j <= segs; j++) {
          const u = j / segs
          const angle = u * Math.PI * 2
          const p = membranePoint(angle, latitude, i * 0.03, t, audio, cfg)

          if (j === 0) ctx.moveTo(p.x, p.y)
          else ctx.lineTo(p.x, p.y)
        }

        const hueDrift = Math.sin(t * 0.12 + i * 0.1) * 6
        const hue =
          v < 0.34 ? 108 + hueDrift :
          v < 0.64 ? 166 + hueDrift :
          204 + hueDrift

        ctx.strokeStyle = hsla(hue, 100, 85, alpha)
        ctx.lineWidth = lineWidth
        ctx.stroke()
      }

      ctx.restore()
    },
    [membranePoint]
  )

  const drawInteriorSheets = useCallback(
    (t: number, audio: number, cfg: ReturnType<typeof stateConfig>) => {
      if (!ctxRef.current) return

      const ctx = ctxRef.current
      const { cx, cy, r } = orbMetrics()
      const layers = Math.floor((isMobileLike() ? 10 : 16) * qualityRef.current)

      ctx.save()
      ctx.globalCompositeOperation = 'lighter'

      for (let layer = 0; layer < layers; layer++) {
        const lt = layer / Math.max(1, layers - 1)
        const alpha = (0.055 + lt * 0.065) * cfg.glow
        const hue = 120 + lt * 84 + Math.sin(t * 0.15 + layer * 0.38) * 5

        ctx.beginPath()

        const start = -Math.PI * 0.08
        const end = Math.PI * 1.08
        const steps = Math.floor((isMobileLike() ? 70 : 110) * qualityRef.current)

        for (let i = 0; i <= steps; i++) {
          const u = i / steps
          const a = start + (end - start) * u

          const shell =
            r * (0.7 + lt * 0.38) +
            Math.sin(a * 3.0 + t * 0.68 * cfg.motion) * r * 0.028 +
            Math.cos(a * 5.0 - t * 0.35 + layer * 0.32) * r * 0.016

          const x =
            cx +
            Math.cos(a) * shell * (0.81 + lt * 0.2) +
            Math.sin(t * 0.38 + layer * 0.22) * r * 0.014

          const y =
            cy +
            Math.sin(a) * shell * (0.41 + lt * 0.11) +
            Math.sin(a * 1.65 + t * 0.55 + layer * 0.6) * r * 0.06 +
            audio * r * 0.02

          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }

        ctx.strokeStyle = hsla(hue, 100, 84, alpha)
        ctx.lineWidth = 1.0 + lt * 1.1
        ctx.stroke()
      }

      ctx.restore()
    },
    [orbMetrics]
  )

  const drawLowerEnergy = useCallback(
    (t: number, audio: number, cfg: ReturnType<typeof stateConfig>) => {
      if (!ctxRef.current) return

      const ctx = ctxRef.current
      const { cx, cy, r } = orbMetrics()
      const bands = Math.floor((isMobileLike() ? 14 : 22) * qualityRef.current)

      ctx.save()
      ctx.globalCompositeOperation = 'lighter'

      for (let i = 0; i < bands; i++) {
        const alpha = (0.045 + i * 0.006) * cfg.basin
        const yBase = cy + r * (0.17 + i * 0.015)
        const amp = r * (0.024 + i * 0.0018)

        ctx.beginPath()

        const steps = Math.floor((isMobileLike() ? 60 : 90) * qualityRef.current)
        for (let j = 0; j <= steps; j++) {
          const u = j / steps
          const x = cx - r * 0.76 + u * r * 1.52
          const y =
            yBase +
            Math.sin(u * Math.PI * 2 + t * 0.85 * cfg.motion + i * 0.2) * amp +
            Math.cos(u * Math.PI * 5.2 - t * 0.34 + i * 0.15) * amp * 0.44 -
            audio * r * 0.025

          if (j === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }

        ctx.strokeStyle = hsla(108 + i * 1.1, 100, 80, alpha)
        ctx.lineWidth = 1.4 + i * 0.07
        ctx.stroke()
      }

      ctx.restore()
    },
    [orbMetrics]
  )

  const drawWisps = useCallback(
    (t: number, audio: number, cfg: ReturnType<typeof stateConfig>) => {
      if (!ctxRef.current) return

      const ctx = ctxRef.current
      const { cx, cy, r } = orbMetrics()
      const wispCount = Math.floor((isMobileLike() ? 10 : 16) * qualityRef.current)

      ctx.save()
      ctx.globalCompositeOperation = 'lighter'

      for (let i = 0; i < wispCount; i++) {
        const side = i % 2 === 0 ? -1 : 1
        const seed = i * 0.32
        const alpha = (0.06 + (1 - i / wispCount) * 0.05) * cfg.wisps
        const hue = 182 + i * 1.6 + Math.sin(t * 0.11 + i) * 7

        ctx.beginPath()

        const steps = Math.floor((isMobileLike() ? 55 : 85) * qualityRef.current)
        for (let j = 0; j <= steps; j++) {
          const u = j / steps
          const lift = u * r * (0.9 + (i % 5) * 0.055)

          const bend =
            Math.sin(u * 4.1 + t * 0.66 * cfg.motion + seed) * r * 0.17 +
            Math.cos(u * 8.0 - t * 0.28 + seed) * r * 0.052

          const flutter =
            Math.sin(u * 13 + t * 1.05 * cfg.motion + seed) * r * 0.02 * (1 - u) +
            audio * r * 0.06 * (1 - u * 0.75)

          const x =
            cx +
            side * r * (0.18 + i * 0.011) +
            bend * side +
            flutter * side

          const y =
            cy -
            r * 0.72 -
            lift +
            Math.sin(u * 5.0 + t * 0.72 + seed) * r * 0.026

          if (j === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }

        ctx.strokeStyle = hsla(hue, 100, 85, alpha)
        ctx.lineWidth = 1.3 + (1 - i / wispCount) * 1.4
        ctx.stroke()
      }

      ctx.restore()
    },
    [orbMetrics]
  )

  const drawParticles = useCallback(
    (t: number, audio: number, cfg: ReturnType<typeof stateConfig>) => {
      if (!ctxRef.current) return

      const ctx = ctxRef.current
      const { cx, cy, r } = orbMetrics()

      ctx.save()
      ctx.globalCompositeOperation = 'lighter'

      for (const p of particlesRef.current) {
        const a = p.angle + t * 0.13 * p.speed * cfg.particles + Math.sin(t * 0.17 + p.phase) * 0.2
        const rr = r * p.radius + Math.sin(t * 0.38 + p.phase) * r * 0.035

        const x = cx + Math.cos(a) * rr * 0.66
        const y = cy + Math.sin(a * 1.2 + p.phase) * rr * 0.29

        const hue = p.band === 0 ? 108 : p.band === 1 ? 168 : 205
        const alpha = (0.09 + audio * 0.18) * cfg.particles
        const size = p.size * 1.3 + audio * 1.5

        ctx.fillStyle = hsla(hue, 100, 86, alpha)
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
    renderRef.current = requestAnimationFrame(render)

    if (!ctxRef.current) return

    const dt = Math.min((now - lastFrameRef.current) / 1000, 0.033)
    lastFrameRef.current = now

    timeRef.current += dt * 60 * 0.016
    smoothAudioRef.current = lerp(smoothAudioRef.current, audioRef.current, 0.08)

    const cfg = stateConfig(stateRef.current)

    clearFrame()
    drawAtmosphericGlow(timeRef.current, smoothAudioRef.current, cfg)
    drawLowerEnergy(timeRef.current, smoothAudioRef.current, cfg)
    drawCoreBody(timeRef.current, smoothAudioRef.current, cfg)
    drawInteriorSheets(timeRef.current, smoothAudioRef.current, cfg)
    drawMembrane(timeRef.current, smoothAudioRef.current, cfg)
    drawWisps(timeRef.current, smoothAudioRef.current, cfg)
    drawParticles(timeRef.current, smoothAudioRef.current, cfg)
    drawVignette()
  }, [clearFrame, drawAtmosphericGlow, drawLowerEnergy, drawCoreBody, drawInteriorSheets, drawMembrane, drawWisps, drawParticles, drawVignette])

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
      if (renderRef.current) {
        cancelAnimationFrame(renderRef.current)
      }
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
      className="fixed inset-0 w-full h-full"
      style={{ display: 'block', touchAction: 'none' }}
    />
  )
}
