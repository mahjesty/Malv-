'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Mic, MicOff, Video, VideoOff, PhoneOff, 
  Maximize2, Minimize2, Signal, Shield, Disc 
} from 'lucide-react'
import { MALVPresence } from '../presence'
import { PresenceState, PresenceVariant } from '../types'

interface VideoCallPanelProps {
  variant?: PresenceVariant
  isExpanded?: boolean
  onToggleExpand?: () => void
  onEndCall?: () => void
  className?: string
}

export function VideoCallPanel({
  variant = 'holographic',
  isExpanded = false,
  onToggleExpand,
  onEndCall,
  className = '',
}: VideoCallPanelProps) {
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOn, setIsCameraOn] = useState(true)
  const [callDuration, setCallDuration] = useState(0)
  const [presenceState, setPresenceState] = useState<PresenceState>('idle')
  const [audioLevel, setAudioLevel] = useState(0)

  // Simulate call duration
  useEffect(() => {
    const interval = setInterval(() => {
      setCallDuration(d => d + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Simulate AI states
  useEffect(() => {
    const states: PresenceState[] = ['listening', 'thinking', 'speaking', 'idle']
    let index = 0
    const interval = setInterval(() => {
      setPresenceState(states[index % states.length])
      index++
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  // Simulate audio levels when speaking
  useEffect(() => {
    if (presenceState === 'speaking') {
      const interval = setInterval(() => {
        setAudioLevel(Math.random() * 0.8 + 0.2)
      }, 100)
      return () => clearInterval(interval)
    } else {
      setAudioLevel(0)
    }
  }, [presenceState])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const getStatusLabel = () => {
    switch (presenceState) {
      case 'listening': return 'Observing'
      case 'thinking': return 'Analyzing'
      case 'speaking': return 'Presenting'
      case 'reconnecting': return 'Reconnecting'
      case 'muted': return 'Standby'
      default: return 'Vision Ready'
    }
  }

  return (
    <motion.div
      className={`relative overflow-hidden rounded-2xl ${className}`}
      style={{
        background: 'linear-gradient(180deg, oklch(0.08 0.015 260) 0%, oklch(0.05 0.01 260) 100%)',
        border: '1px solid oklch(0.25 0.04 260 / 0.5)',
      }}
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
    >
      {/* Cinematic gradient border glow */}
      <motion.div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          background: `conic-gradient(from 0deg, 
            oklch(0.6 0.2 280 / 0.3), 
            oklch(0.7 0.18 200 / 0.3), 
            oklch(0.6 0.2 280 / 0.3))`,
          padding: '1px',
          mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          maskComposite: 'exclude',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
      />

      {/* Top HUD overlay */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-background/80 to-transparent">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <motion.div
              className="flex items-center gap-1 px-2 py-0.5 rounded"
              style={{ background: 'oklch(0.5 0.2 25 / 0.3)' }}
              animate={{ opacity: [1, 0.6, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Disc className="w-3 h-3 text-red-400" />
              <span className="text-xs font-medium text-red-400">REC</span>
            </motion.div>
            <span className="text-xs text-foreground/60 font-mono ml-1">{formatTime(callDuration)}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div 
            className="px-2 py-0.5 rounded text-xs font-medium"
            style={{
              background: 'oklch(0.2 0.03 260 / 0.8)',
              border: '1px solid oklch(0.35 0.05 260 / 0.5)',
              color: 'oklch(0.75 0.12 200)',
            }}
          >
            HD 1080p
          </div>
          <div 
            className="px-2 py-0.5 rounded text-xs font-medium"
            style={{
              background: 'oklch(0.2 0.03 260 / 0.8)',
              border: '1px solid oklch(0.35 0.05 260 / 0.5)',
              color: 'oklch(0.75 0.15 280)',
            }}
          >
            60 FPS
          </div>
        </div>
      </div>

      {/* Main video/presence area */}
      <div className={`relative flex flex-col items-center justify-center ${isExpanded ? 'py-20 md:py-32' : 'py-14 md:py-20'}`}>
        {/* Scan lines overlay */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-5"
          style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, oklch(0.7 0.1 200) 2px, oklch(0.7 0.1 200) 3px)',
          }}
        />

        {/* Status label */}
        <motion.div
          className="absolute top-8 left-1/2 -translate-x-1/2 z-10"
          key={presenceState}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
        >
          <div 
            className="px-4 py-1.5 rounded-full text-xs font-medium tracking-wide"
            style={{
              background: 'oklch(0.15 0.025 260 / 0.9)',
              border: '1px solid oklch(0.4 0.08 280 / 0.5)',
              color: 'oklch(0.8 0.15 280)',
              backdropFilter: 'blur(8px)',
            }}
          >
            {getStatusLabel()}
          </div>
        </motion.div>

        {/* MALV Presence */}
        <MALVPresence
          variant={variant}
          state={isMuted ? 'muted' : presenceState}
          audioLevel={audioLevel}
          className={`${isExpanded ? 'w-56 h-56 md:w-72 md:h-72' : 'w-36 h-36 md:w-48 md:h-48'}`}
        />

        {/* Connection quality indicator */}
        <div className="flex items-center gap-2 mt-6">
          <div className="flex items-center gap-1 text-xs text-emerald-400">
            <Signal className="w-3.5 h-3.5" />
            <span>Signal Stable</span>
          </div>
          <div className="w-px h-3 bg-border/50" />
          <div className="flex items-center gap-1 text-xs text-cyan-400">
            <Shield className="w-3.5 h-3.5" />
            <span>Encrypted</span>
          </div>
        </div>
      </div>

      {/* User camera preview (mock) */}
      {isCameraOn && (
        <motion.div
          className="absolute bottom-20 right-4 w-24 h-32 md:w-32 md:h-40 rounded-xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, oklch(0.15 0.02 260) 0%, oklch(0.1 0.015 260) 100%)',
            border: '2px solid oklch(0.3 0.04 260 / 0.5)',
            boxShadow: '0 8px 32px oklch(0 0 0 / 0.4)',
          }}
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 20 }}
        >
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500/30 to-cyan-500/30 flex items-center justify-center">
              <span className="text-lg font-medium text-foreground/60">You</span>
            </div>
          </div>
          {/* Camera frame corners */}
          <div className="absolute top-1 left-1 w-3 h-3 border-t-2 border-l-2 border-cyan-400/50 rounded-tl" />
          <div className="absolute top-1 right-1 w-3 h-3 border-t-2 border-r-2 border-cyan-400/50 rounded-tr" />
          <div className="absolute bottom-1 left-1 w-3 h-3 border-b-2 border-l-2 border-cyan-400/50 rounded-bl" />
          <div className="absolute bottom-1 right-1 w-3 h-3 border-b-2 border-r-2 border-cyan-400/50 rounded-br" />
        </motion.div>
      )}

      {/* Controls */}
      <div className="relative flex items-center justify-center gap-3 md:gap-4 px-4 py-4 bg-gradient-to-t from-background/80 to-transparent">
        <motion.button
          className="flex items-center justify-center w-11 h-11 md:w-12 md:h-12 rounded-full"
          style={{
            background: isMuted ? 'oklch(0.5 0.2 25)' : 'oklch(0.18 0.03 260)',
            border: '1px solid oklch(0.3 0.04 260 / 0.5)',
          }}
          whileHover={{ scale: 1.08, boxShadow: '0 0 25px oklch(0.7 0.18 200 / 0.4)' }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsMuted(!isMuted)}
        >
          {isMuted ? (
            <MicOff className="w-5 h-5 text-foreground" />
          ) : (
            <Mic className="w-5 h-5 text-foreground" />
          )}
        </motion.button>

        <motion.button
          className="flex items-center justify-center w-11 h-11 md:w-12 md:h-12 rounded-full"
          style={{
            background: !isCameraOn ? 'oklch(0.5 0.2 25)' : 'oklch(0.18 0.03 260)',
            border: '1px solid oklch(0.3 0.04 260 / 0.5)',
          }}
          whileHover={{ scale: 1.08, boxShadow: '0 0 25px oklch(0.65 0.2 280 / 0.4)' }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsCameraOn(!isCameraOn)}
        >
          {isCameraOn ? (
            <Video className="w-5 h-5 text-foreground" />
          ) : (
            <VideoOff className="w-5 h-5 text-foreground" />
          )}
        </motion.button>

        <motion.button
          className="flex items-center justify-center w-14 h-14 md:w-16 md:h-16 rounded-full"
          style={{
            background: 'linear-gradient(135deg, oklch(0.55 0.24 25) 0%, oklch(0.45 0.22 20) 100%)',
            boxShadow: '0 6px 30px oklch(0.5 0.2 25 / 0.5)',
          }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={onEndCall}
        >
          <PhoneOff className="w-6 h-6 md:w-7 md:h-7 text-foreground" />
        </motion.button>

        {/* Expand button */}
        <motion.button
          className="absolute right-4 flex items-center justify-center w-9 h-9 rounded-lg"
          style={{
            background: 'oklch(0.15 0.02 260)',
            border: '1px solid oklch(0.25 0.03 260 / 0.5)',
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={onToggleExpand}
        >
          {isExpanded ? (
            <Minimize2 className="w-4 h-4 text-muted-foreground" />
          ) : (
            <Maximize2 className="w-4 h-4 text-muted-foreground" />
          )}
        </motion.button>
      </div>
    </motion.div>
  )
}
