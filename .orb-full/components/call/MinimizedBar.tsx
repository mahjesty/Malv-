'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Mic, MicOff, Volume2, VolumeX, PhoneOff, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MinimizedBarProps {
  micMuted: boolean
  speakerOn: boolean
  audioLevel: number
  callDuration: string
  onExpand: () => void
  onMicToggle: () => void
  onSpeakerToggle: () => void
  onEndCall: () => void
}

function MiniOrb({ audioLevel, micMuted }: { audioLevel: number; micMuted: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const tRef = useRef(0)
  const audioRef = useRef(audioLevel)
  const mutedRef = useRef(micMuted)

  useEffect(() => { audioRef.current = audioLevel }, [audioLevel])
  useEffect(() => { mutedRef.current = micMuted }, [micMuted])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const S = 32
    canvas.width = S
    canvas.height = S

    const draw = () => {
      tRef.current += 0.022
      const t = tRef.current
      const cx = S / 2
      const cy = S / 2
      const audio = audioRef.current
      const muted = mutedRef.current
      const r = 7 + audio * 3

      ctx.clearRect(0, 0, S, S)

      // Glow
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.1)
      g.addColorStop(0, muted ? `rgba(255,70,70,${0.35 + audio * 0.2})` : `rgba(120,255,210,${0.38 + audio * 0.22})`)
      g.addColorStop(0.5, muted ? `rgba(200,30,30,0.10)` : `rgba(60,210,255,0.12)`)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(cx, cy, r * 2.1, 0, Math.PI * 2)
      ctx.fill()

      // Rings
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      const rings = 4
      for (let i = 0; i < rings; i++) {
        const ri = i / (rings - 1)
        const rr = r * (0.5 + ri * 0.6)
        ctx.beginPath()
        const pts = 36
        for (let j = 0; j <= pts; j++) {
          const a = (j / pts) * Math.PI * 2
          const w =
            Math.sin(a * 3 + t * 1.6 + i * 0.6) * (1.0 + audio * 3) +
            Math.cos(a * 5 - t * 1.0 + i * 0.4) * (0.5 + audio * 1.5)
          const px = cx + Math.cos(a) * (rr + w)
          const py = cy + Math.sin(a) * (rr * 0.55 + w * 0.35)
          j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
        }
        const hue = muted ? 0 : 138 + ri * 58
        const alpha = (0.25 + ri * 0.28 + audio * 0.22) * (muted ? 0.65 : 1)
        ctx.strokeStyle = `hsla(${hue},100%,82%,${alpha})`
        ctx.lineWidth = 0.7 + ri * 0.5
        ctx.stroke()
      }
      ctx.restore()

      rafRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return <canvas ref={canvasRef} width={32} height={32} className="shrink-0" aria-hidden="true" />
}

export default function MinimizedBar({
  micMuted, speakerOn, audioLevel, callDuration,
  onExpand, onMicToggle, onSpeakerToggle, onEndCall,
}: MinimizedBarProps) {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [isHidden, setIsHidden] = useState(false)
  const [hiddenSide, setHiddenSide] = useState<'left' | 'right'>('right')
  const draggingRef = useRef(false)
  const startRef = useRef({ mx: 0, my: 0, px: 0, py: 0 })
  const barRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Init position: bottom-right
  useEffect(() => {
    const bw = barRef.current?.offsetWidth ?? 200
    setPos({ x: window.innerWidth - bw - 16, y: window.innerHeight - 72 })
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    draggingRef.current = true
    startRef.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y }
    containerRef.current?.setPointerCapture(e.pointerId)
    e.preventDefault()
  }, [pos])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return
    const dx = e.clientX - startRef.current.mx
    const dy = e.clientY - startRef.current.my
    const bw = barRef.current?.offsetWidth ?? 200
    const bh = barRef.current?.offsetHeight ?? 52
    const nx = Math.max(-bw + 40, Math.min(window.innerWidth - 40, startRef.current.px + dx))
    const ny = Math.max(8, Math.min(window.innerHeight - bh - 8, startRef.current.py + dy))
    setPos({ x: nx, y: ny })
  }, [])

  const onPointerUp = useCallback(() => {
    if (!draggingRef.current) return
    draggingRef.current = false

    const bw = barRef.current?.offsetWidth ?? 200
    const screenW = window.innerWidth

    // Check if widget should hide to left or right edge
    if (pos.x < 20) {
      setIsHidden(true)
      setHiddenSide('left')
      setPos(p => ({ ...p, x: -bw + 6 }))
    } else if (pos.x + bw > screenW - 20) {
      setIsHidden(true)
      setHiddenSide('right')
      setPos(p => ({ ...p, x: screenW - 6 }))
    }
  }, [pos.x])

  const slideOut = useCallback(() => {
    const bw = barRef.current?.offsetWidth ?? 200
    if (hiddenSide === 'left') {
      setPos(p => ({ ...p, x: 12 }))
    } else {
      setPos(p => ({ ...p, x: window.innerWidth - bw - 12 }))
    }
    setIsHidden(false)
  }, [hiddenSide])

  return (
    <div
      ref={containerRef}
      style={{ left: pos.x, top: pos.y, position: 'fixed' }}
      className="z-50 select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="relative flex items-center">
        {/* Arrow tab when hidden on left */}
        {isHidden && hiddenSide === 'left' && (
          <button
            onClick={slideOut}
            className={cn(
              'absolute -right-8 top-1/2 -translate-y-1/2',
              'w-8 h-10 flex items-center justify-center',
              'bg-[oklch(0.14_0.006_240/0.95)] border border-[oklch(0.28_0_0/0.50)]',
              'border-l-0 rounded-r-xl',
              'backdrop-blur-xl shadow-lg',
              'text-foreground/70 hover:text-foreground',
              'transition-all duration-200 active:scale-95',
            )}
            aria-label="Show call widget"
          >
            <ChevronRight size={16} strokeWidth={2} />
          </button>
        )}

        {/* Main bar */}
        <div
          ref={barRef}
          className={cn(
            'flex items-center gap-1.5 rounded-xl cursor-grab active:cursor-grabbing',
            'bg-[oklch(0.12_0.004_240/0.94)] border border-[oklch(0.26_0_0/0.55)]',
            'backdrop-blur-2xl shadow-[0_4px_20px_oklch(0_0_0/0.50)]',
            'px-2 py-1.5',
            'transition-opacity duration-200',
            isHidden && 'opacity-0 pointer-events-none',
          )}
        >
          {/* Live orb — click to expand */}
          <button
            onClick={onExpand}
            aria-label="Expand call"
            className="shrink-0 active:scale-90 transition-transform"
          >
            <MiniOrb audioLevel={audioLevel} micMuted={micMuted} />
          </button>

          {/* Timer */}
          <button
            onClick={onExpand}
            className="flex flex-col items-start min-w-0 pr-0.5 hover:opacity-80 transition-opacity"
          >
            <span className="text-[7px] font-mono tracking-[0.18em] uppercase text-muted-foreground/40 leading-none mb-0.5">
              MALV
            </span>
            <span className="text-[10px] font-mono tabular-nums tracking-wider text-foreground/70 leading-none whitespace-nowrap">
              {callDuration}
            </span>
          </button>

          {/* Divider */}
          <div className="w-px h-4 bg-[oklch(0.28_0_0/0.35)] shrink-0" />

          {/* Mic */}
          <button
            onClick={(e) => { e.stopPropagation(); onMicToggle() }}
            aria-label={micMuted ? 'Unmute mic' : 'Mute mic'}
            aria-pressed={micMuted}
            className={cn(
              'w-6 h-6 flex items-center justify-center rounded-md transition-all duration-150 active:scale-90 shrink-0',
              micMuted ? 'bg-red-500/25 text-red-400' : 'text-foreground/55 hover:bg-[oklch(0.18_0_0)]',
            )}
          >
            {micMuted ? <MicOff size={12} strokeWidth={1.8} /> : <Mic size={12} strokeWidth={1.8} />}
          </button>

          {/* Speaker */}
          <button
            onClick={(e) => { e.stopPropagation(); onSpeakerToggle() }}
            aria-label={speakerOn ? 'Mute speaker' : 'Unmute speaker'}
            aria-pressed={!speakerOn}
            className={cn(
              'w-6 h-6 flex items-center justify-center rounded-md transition-all duration-150 active:scale-90 shrink-0',
              !speakerOn ? 'bg-orange-500/25 text-orange-400' : 'text-foreground/55 hover:bg-[oklch(0.18_0_0)]',
            )}
          >
            {speakerOn ? <Volume2 size={12} strokeWidth={1.8} /> : <VolumeX size={12} strokeWidth={1.8} />}
          </button>

          {/* End call */}
          <button
            onClick={(e) => { e.stopPropagation(); onEndCall() }}
            aria-label="End call"
            className="w-6 h-6 flex items-center justify-center rounded-md bg-red-500/25 text-red-400 hover:bg-red-500/40 transition-all duration-150 active:scale-90 shrink-0"
          >
            <PhoneOff size={12} strokeWidth={1.8} />
          </button>
        </div>

        {/* Arrow tab when hidden on right */}
        {isHidden && hiddenSide === 'right' && (
          <button
            onClick={slideOut}
            className={cn(
              'absolute -left-8 top-1/2 -translate-y-1/2',
              'w-8 h-10 flex items-center justify-center',
              'bg-[oklch(0.14_0.006_240/0.95)] border border-[oklch(0.28_0_0/0.50)]',
              'border-r-0 rounded-l-xl',
              'backdrop-blur-xl shadow-lg',
              'text-foreground/70 hover:text-foreground',
              'transition-all duration-200 active:scale-95',
            )}
            aria-label="Show call widget"
          >
            <ChevronLeft size={16} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  )
}
