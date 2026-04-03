'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import ConnectionBanner from './ConnectionBanner'
import CallHeader from './CallHeader'
import OrbArea from './OrbArea'
import BottomControls from './BottomControls'
import PreCallScreen from './PreCallScreen'
import type { ConnectionState } from './ConnectionBanner'
import type { CallState } from './OrbArea'

type ScreenPhase = 'pre-call' | 'active' | 'ended'

const DEMO_STATES: CallState[] = ['listening', 'thinking', 'speaking', 'listening']
const DEMO_CONNECTIONS: ConnectionState[] = ['healthy', 'healthy', 'weak', 'reconnecting', 'healthy']

export default function CallScreen() {
  const [phase, setPhase] = useState<ScreenPhase>('pre-call')
  const [controlsVisible, setControlsVisible] = useState(true)
  const [micMuted, setMicMuted] = useState(false)
  const [speakerOn, setSpeakerOn] = useState(true)
  const [malvMuted, setMalvMuted] = useState(false)
  const [callState, setCallState] = useState<CallState>('listening')
  const [connection, setConnection] = useState<ConnectionState>('healthy')

  // Real timer — only ticks while in 'active' phase
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startTimer = useCallback(() => {
    setElapsed(0)
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // Auto-hide controls after 5 s of inactivity
  const autoHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resetAutoHide = useCallback(() => {
    if (autoHideTimer.current) clearTimeout(autoHideTimer.current)
    autoHideTimer.current = setTimeout(() => setControlsVisible(false), 5000)
  }, [])

  // Tap anywhere on screen: toggle controls visibility
  const handleScreenTap = useCallback(() => {
    if (phase !== 'active') return
    setControlsVisible((v) => {
      const next = !v
      if (next) resetAutoHide()
      else if (autoHideTimer.current) clearTimeout(autoHideTimer.current)
      return next
    })
  }, [phase, resetAutoHide])

  // Tap on a control button — show controls and reset auto-hide without toggling off
  const handleControlInteract = useCallback(() => {
    setControlsVisible(true)
    resetAutoHide()
  }, [resetAutoHide])

  // Start call
  const handleStartCall = useCallback(() => {
    setPhase('active')
    setControlsVisible(true)
    startTimer()
    resetAutoHide()
  }, [startTimer, resetAutoHide])

  // End call
  const handleEndCall = useCallback(() => {
    stopTimer()
    setPhase('ended')
  }, [stopTimer])

  // Demo: cycle AI call states every 4 s while active
  useEffect(() => {
    if (phase !== 'active') return
    let idx = 0
    const id = setInterval(() => {
      idx = (idx + 1) % DEMO_STATES.length
      setCallState(DEMO_STATES[idx])
    }, 4000)
    return () => clearInterval(id)
  }, [phase])

  // Demo: cycle connection states every 7 s while active
  useEffect(() => {
    if (phase !== 'active') return
    let idx = 0
    const id = setInterval(() => {
      idx = (idx + 1) % DEMO_CONNECTIONS.length
      setConnection(DEMO_CONNECTIONS[idx])
    }, 7000)
    return () => clearInterval(id)
  }, [phase])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimer()
      if (autoHideTimer.current) clearTimeout(autoHideTimer.current)
    }
  }, [stopTimer])

  const formatDuration = (s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    }
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  // Pre-call screen
  if (phase === 'pre-call') {
    return <PreCallScreen onStartCall={handleStartCall} />
  }

  // Post-call screen
  if (phase === 'ended') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-[var(--call-bg)]">
        <p className="text-[11px] font-mono tracking-[0.24em] uppercase text-muted-foreground/40">
          Call ended
        </p>
        <p className="text-[13px] font-mono tracking-widest text-muted-foreground/25">
          {formatDuration(elapsed)}
        </p>
        <button
          onClick={() => {
            setPhase('pre-call')
            setElapsed(0)
            setCallState('listening')
            setConnection('healthy')
            setMicMuted(false)
            setSpeakerOn(true)
            setMalvMuted(false)
          }}
          className={cn(
            'mt-4 px-8 py-3 rounded-full',
            'bg-[var(--call-glass)] border border-[var(--call-glass-border)]',
            'backdrop-blur-xl text-foreground/60 font-mono text-[11px] tracking-[0.22em] uppercase',
            'hover:text-foreground transition-all duration-200 active:scale-95',
          )}
        >
          Exit
        </button>
      </div>
    )
  }

  // Active call screen
  return (
    <div
      className="fixed inset-0 flex flex-col bg-[var(--call-bg)] overflow-hidden select-none"
      onClick={handleScreenTap}
      role="main"
      aria-label="MALV voice call"
    >
      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 80% at 50% 50%, transparent 40%, oklch(0.04 0 0 / 0.65) 100%)',
        }}
        aria-hidden="true"
      />

      <ConnectionBanner state={connection} visible={connection !== 'healthy'} />

      <CallHeader
        visible={controlsVisible}
        callDuration={formatDuration(elapsed)}
        onMinimize={() => setControlsVisible(false)}
      />

      <OrbArea
        callState={callState}
        muted={micMuted}
        malvMuted={malvMuted}
      />

      <BottomControls
        visible={controlsVisible}
        micMuted={micMuted}
        speakerOn={speakerOn}
        malvMuted={malvMuted}
        onMicToggle={() => { setMicMuted((v) => !v); handleControlInteract() }}
        onSpeakerToggle={() => { setSpeakerOn((v) => !v); handleControlInteract() }}
        onMalvMuteToggle={() => { setMalvMuted((v) => !v); handleControlInteract() }}
        onEndCall={handleEndCall}
      />
    </div>
  )
}
