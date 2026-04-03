import { useEffect, useRef, useState, useCallback, useLayoutEffect, type MutableRefObject } from "react";
import { Mic, MicOff, Volume2, VolumeX, PhoneOff, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

interface MinimizedBarProps {
  micMuted: boolean;
  speakerOn: boolean;
  status: "listening" | "thinking" | "speaking" | "muted" | "idle";
  /** Fallback when `audioLevelRef` is absent. */
  audioLevel: number;
  /** Smoothed 0–1 from orb (preferred; avoids React updates per frame). */
  audioLevelRef?: MutableRefObject<number>;
  callDuration: string;
  side: "left" | "right";
  y: number;
  hidden: boolean;
  unreadCount?: number;
  pulse?: boolean;
  onSideChange?: (side: "left" | "right") => void;
  onYChange?: (y: number) => void;
  onHiddenChange?: (hidden: boolean) => void;
  onDraggingChange?: (dragging: boolean) => void;
  onExpand: () => void;
  onMicToggle: () => void;
  onSpeakerToggle: () => void;
  onEndCall: () => void;
}

function MiniOrb({
  audioLevel,
  audioLevelRef,
  micMuted,
}: {
  audioLevel: number
  audioLevelRef?: MutableRefObject<number>
  micMuted: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const tRef = useRef(0)
  const audioRef = useRef(audioLevel)
  const mutedRef = useRef(micMuted)

  useEffect(() => {
    if (!audioLevelRef) audioRef.current = audioLevel
  }, [audioLevel, audioLevelRef])
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
      if (audioLevelRef) audioRef.current = audioLevelRef.current
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
  }, [audioLevelRef])

  return <canvas ref={canvasRef} width={32} height={32} className="shrink-0" aria-hidden="true" />
}

export default function MinimizedBar({
  micMuted,
  speakerOn,
  status,
  audioLevel,
  audioLevelRef,
  callDuration,
  side,
  y,
  hidden,
  unreadCount = 0,
  pulse = false,
  onSideChange,
  onYChange,
  onHiddenChange,
  onDraggingChange,
  onExpand,
  onMicToggle,
  onSpeakerToggle,
  onEndCall
}: MinimizedBarProps) {
  const [isHidden, setIsHidden] = useState(hidden);
  const hostRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const suppressHandleClickRef = useRef(false);
  const hiddenRef = useRef(hidden);
  const dragRef = useRef({
    pointerId: -1,
    dragging: false,
    moved: false,
    startX: 0,
    startY: 0,
    startDockY: y,
    pendingClientX: 0,
    pendingClientY: 0,
    lastClientX: 0,
    lastTs: 0,
    velocityX: 0,
    rafQueued: false
  });
  const animRef = useRef({ x: 0, y, vx: 0, raf: 0 });

  const TAB_WIDTH = 34;
  const EDGE_GAP = 8;

  const applyTransform = useCallback((x: number, nextY: number) => {
    const host = hostRef.current;
    if (!host) return;
    host.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(nextY)}px, 0)`;
  }, []);

  const clampY = useCallback((rawY: number) => {
    const maxY = window.innerHeight - 116;
    return Math.max(72, Math.min(maxY, rawY));
  }, []);

  const getRestX = useCallback((nextSide: "left" | "right") => {
    if (nextSide === "left") return EDGE_GAP;
    return window.innerWidth - TAB_WIDTH - EDGE_GAP;
  }, []);

  const animateTo = useCallback(
    (targetX: number, targetY: number) => {
      if (animRef.current.raf) cancelAnimationFrame(animRef.current.raf);
      const run = () => {
        const cx = animRef.current.x;
        const cy = animRef.current.y;
        const dx = targetX - cx;
        const dy = targetY - cy;
        animRef.current.vx = animRef.current.vx * 0.76 + dx * 0.16;
        const nx = cx + animRef.current.vx;
        const ny = cy + dy * 0.26;
        animRef.current.x = nx;
        animRef.current.y = ny;
        applyTransform(nx, ny);
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(animRef.current.vx) < 0.5) {
          animRef.current.x = targetX;
          animRef.current.y = targetY;
          applyTransform(targetX, targetY);
          animRef.current.raf = 0;
          return;
        }
        animRef.current.raf = requestAnimationFrame(run);
      };
      animRef.current.raf = requestAnimationFrame(run);
    },
    [applyTransform]
  );

  const commitHidden = useCallback((next: boolean) => {
    hiddenRef.current = next;
    setIsHidden(next);
    onHiddenChange?.(next);
  }, [onHiddenChange]);

  const frameDrag = useCallback(() => {
    const d = dragRef.current;
    if (!d.dragging) {
      d.rafQueued = false;
      return;
    }
    const dx = d.pendingClientX - d.startX;
    const dy = d.pendingClientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) > 7) {
      d.moved = true;
      suppressHandleClickRef.current = true;
      if (hiddenRef.current) commitHidden(false);
    }
    const w = cardRef.current?.offsetWidth ?? 258;
    const nx = Math.max(-w + 42, Math.min(window.innerWidth - 42, d.pendingClientX - TAB_WIDTH / 2));
    const ny = clampY(d.startDockY + dy);
    animRef.current.x = nx;
    animRef.current.y = ny;
    applyTransform(nx, ny);
    d.rafQueued = false;
  }, [applyTransform, clampY, commitHidden]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-no-drag="true"]')) return;
    const host = hostRef.current;
    if (!host) return;
    dragRef.current = {
      pointerId: e.pointerId,
      dragging: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      startDockY: animRef.current.y,
      pendingClientX: e.clientX,
      pendingClientY: e.clientY,
      lastClientX: e.clientX,
      lastTs: performance.now(),
      velocityX: 0,
      rafQueued: false
    };
    suppressHandleClickRef.current = false;
    host.setPointerCapture(e.pointerId);
    onDraggingChange?.(true);
    e.preventDefault();
  }, [onDraggingChange]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d.dragging || d.pointerId !== e.pointerId) return;
    const now = performance.now();
    const dt = Math.max(1, now - d.lastTs);
    const instantVx = ((e.clientX - d.lastClientX) / dt) * 1000;
    d.velocityX = d.velocityX * 0.72 + instantVx * 0.28;
    d.lastClientX = e.clientX;
    d.lastTs = now;
    d.pendingClientX = e.clientX;
    d.pendingClientY = e.clientY;
    if (!d.rafQueued) {
      d.rafQueued = true;
      requestAnimationFrame(frameDrag);
    }
  }, [frameDrag]);

  const endDrag = useCallback((pointerId: number, clientX: number) => {
    const host = hostRef.current;
    const d = dragRef.current;
    if (!d.dragging || d.pointerId !== pointerId) return;
    if (host?.hasPointerCapture(pointerId)) host.releasePointerCapture(pointerId);
    d.dragging = false;
    onDraggingChange?.(false);

    const wasMoved = d.moved;
    const nextSide: "left" | "right" = clientX < window.innerWidth * 0.5 || d.velocityX < -520 ? "left" : "right";
    onSideChange?.(nextSide);
    onYChange?.(clampY(animRef.current.y));

    let nextHidden = hiddenRef.current;
    if (wasMoved) {
      const distToEdge = nextSide === "left" ? clientX : window.innerWidth - clientX;
      const flingToEdge = (nextSide === "left" && d.velocityX < -980) || (nextSide === "right" && d.velocityX > 980);
      const revealIntent = distToEdge > 68 && Math.abs(d.velocityX) < 1200;
      nextHidden = !revealIntent && (distToEdge < 48 || flingToEdge);
    }

    commitHidden(nextHidden);
    animateTo(getRestX(nextSide), clampY(animRef.current.y));
  }, [animateTo, clampY, commitHidden, getRestX, onDraggingChange, onSideChange, onYChange]);

  useLayoutEffect(() => {
    hiddenRef.current = hidden;
    setIsHidden(hidden);
  }, [hidden]);

  useLayoutEffect(() => {
    const nextY = clampY(y);
    animRef.current.y = nextY;
    animRef.current.x = getRestX(side);
    applyTransform(animRef.current.x, nextY);
  }, [applyTransform, clampY, getRestX, side, y]);

  useEffect(() => {
    const onResize = () => {
      const nextY = clampY(animRef.current.y);
      animRef.current.y = nextY;
      animateTo(getRestX(side), nextY);
      onYChange?.(nextY);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [animateTo, clampY, getRestX, onYChange, side]);

  useEffect(() => {
    return () => {
      if (animRef.current.raf) cancelAnimationFrame(animRef.current.raf);
      onDraggingChange?.(false);
    };
  }, [onDraggingChange]);

  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <div
      ref={hostRef}
      style={{ left: 0, top: 0, position: "fixed", willChange: "transform" }}
      className="z-[120] touch-none select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endDrag(e.pointerId, e.clientX)}
      onPointerCancel={(e) => endDrag(e.pointerId, e.clientX)}
    >
      <div className="relative h-14 w-[34px] overflow-visible">
        <div
          ref={cardRef}
          className={cn(
            "malv-voice-glass-panel absolute top-1/2 flex h-14 min-w-[252px] -translate-y-1/2 items-center gap-1.5 rounded-2xl px-2.5",
            side === "left" ? "left-11" : "right-11",
            "[box-shadow:inset_0_0_22px_rgba(135,232,255,0.07),0_12px_32px_oklch(0_0_0/0.45)]",
            "transition-[opacity,transform] duration-220 ease-out",
            isHidden
              ? side === "left"
                ? "pointer-events-none translate-x-3 opacity-0"
                : "pointer-events-none -translate-x-3 opacity-0"
              : "translate-x-0 opacity-100",
            pulse && !isHidden && "shadow-[0_0_24px_rgba(120,255,220,0.30)]"
          )}
        >
          <button data-no-drag="true" type="button" onClick={onExpand} aria-label="Expand call" className="rounded-full">
            <MiniOrb audioLevel={audioLevel} audioLevelRef={audioLevelRef} micMuted={micMuted} />
          </button>
          <button data-no-drag="true" type="button" onClick={onExpand} className="flex min-w-0 flex-col items-start pr-1 text-left">
            <span className="text-[7px] font-mono uppercase tracking-[0.2em] text-muted-foreground/35">MALV</span>
            <span className="malv-call-timer whitespace-nowrap font-mono text-[10px] tabular-nums tracking-wider text-foreground/80">
              {callDuration}
            </span>
            <span className="text-[8px] font-mono uppercase tracking-[0.18em] text-cyan-100/55">{statusLabel}</span>
          </button>
          {unreadCount > 0 ? (
            <span className="rounded-full border border-cyan-300/35 bg-cyan-400/15 px-1.5 py-0.5 text-[9px] font-mono text-cyan-100">
              +{Math.min(unreadCount, 99)}
            </span>
          ) : null}
          <div className="mx-0.5 h-4 w-px shrink-0 bg-white/12" />
          <button
            data-no-drag="true"
            type="button"
            onClick={onMicToggle}
            aria-label={micMuted ? "Unmute mic" : "Mute mic"}
            aria-pressed={micMuted}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full border transition-transform active:scale-[0.94]",
              micMuted ? "border-red-400/30 bg-red-500/16 text-red-300/90" : "border-white/20 bg-white/8 text-indigo-100/80"
            )}
          >
            {micMuted ? <MicOff size={13} strokeWidth={1.9} /> : <Mic size={13} strokeWidth={1.9} />}
          </button>
          <button
            data-no-drag="true"
            type="button"
            onClick={onSpeakerToggle}
            aria-label={speakerOn ? "Mute speaker" : "Unmute speaker"}
            aria-pressed={!speakerOn}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full border transition-transform active:scale-[0.94]",
              speakerOn ? "border-white/20 bg-white/8 text-violet-100/80" : "border-amber-300/28 bg-amber-500/14 text-amber-200/85"
            )}
          >
            {speakerOn ? <Volume2 size={13} strokeWidth={1.9} /> : <VolumeX size={13} strokeWidth={1.9} />}
          </button>
          <button
            data-no-drag="true"
            type="button"
            onClick={onEndCall}
            aria-label="End call"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-red-400/35 bg-[oklch(0.48_0.17_25/0.4)] text-red-100/92 transition-transform active:scale-[0.94]"
          >
            <PhoneOff size={13} strokeWidth={1.9} />
          </button>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (suppressHandleClickRef.current) {
              suppressHandleClickRef.current = false;
              return;
            }
            const nextHidden = !isHidden;
            commitHidden(nextHidden);
            animateTo(getRestX(side), animRef.current.y);
          }}
          className={cn(
            "malv-voice-glass-panel absolute top-1/2 z-20 flex h-14 w-[34px] -translate-y-1/2 items-center justify-center rounded-2xl",
            side === "left" ? "left-0" : "left-0",
            "[box-shadow:inset_0_0_18px_rgba(120,255,220,0.08),0_8px_24px_oklch(0_0_0/0.36)] ring-1 ring-cyan-200/15"
          )}
          aria-label={isHidden ? "Reveal call dock" : "Tuck call dock"}
        >
          <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(120%_100%_at_50%_50%,rgba(120,255,220,0.18),transparent_65%)]" />
          <div className="relative flex flex-col items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-cyan-200/90 shadow-[0_0_10px_rgba(120,255,220,0.7)]" />
            {side === "left" ? (
              isHidden ? <ChevronRight size={14} strokeWidth={2} /> : <ChevronLeft size={14} strokeWidth={2} />
            ) : (
              isHidden ? <ChevronLeft size={14} strokeWidth={2} /> : <ChevronRight size={14} strokeWidth={2} />
            )}
          </div>
        </button>
      </div>
    </div>
  );
}
