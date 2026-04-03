'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, Volume2, VolumeX, PhoneOff, Maximize2, Minimize2, Signal, Shield } from 'lucide-react'
import { MALVPresence } from '../presence'
import { PresenceState, PresenceVariant } from '../types'

interface AudioCallPanelProps {
  variant?: PresenceVariant
  isExpanded?: boolean
  onToggleExpand?: () => void
  onEndCall?: () => void
  className?: string
}

export function AudioCallPanel({
  variant = 'pulse',
  isExpanded = false,
  onToggleExpand,
  onEndCall,
  className = '',
}: AudioCallPanelProps) {
  const [isMuted, setIsMuted] = useState(false)
  const [isSpeakerOn, setIsSpeakerOn] = useState(true)
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
      case 'listening': return 'Listening'
      case 'thinking': return 'Processing'
      case 'speaking': return 'Responding'
      case 'reconnecting': return 'Reconnecting'
      case 'muted': return 'Paused'
      default: return 'Voice Active'
    }
  }

  return (
    <motion.div
      className={`relative overflow-hidden rounded-2xl ${className}`}
      style={{
        background: 'linear-gradient(180deg, oklch(0.1 0.02 260) 0%, oklch(0.06 0.015 260) 100%)',
        border: '1px solid oklch(0.25 0.04 260 / 0.5)',
      }}
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
    >
      {/* Ambient glow background */}
      <div 
        className="absolute inset-0 opacity-30"
        style={{
          background: 'radial-gradient(circle at 50% 50%, oklch(0.7 0.18 200 / 0.15) 0%, transparent 70%)',
        }}
      />

      {/* Top status bar */}
      <div className="relative flex items-center justify-between px-4 py-3 border-b border-border/30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <motion.div
              className="w-2 h-2 rounded-full"
              style={{ background: 'oklch(0.7 0.2 150)' }}
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <span className="text-xs font-medium text-foreground/80">MALV Voice</span>
          </div>
          <div className="h-3 w-px bg-border/50" />
          <span className="text-xs text-muted-foreground font-mono">{formatTime(callDuration)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Signal className="w-3 h-3" />
            <span>Stable</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-emerald-400">
            <Shield className="w-3 h-3" />
            <span>Secure</span>
          </div>
        </div>
      </div>

      {/* Main presence area */}
      <div className={`relative flex flex-col items-center justify-center ${isExpanded ? 'py-16 md:py-24' : 'py-10 md:py-14'}`}>
        {/* Status label */}
        <motion.div
          className="absolute top-4 left-1/2 -translate-x-1/2"
          key={presenceState}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
        >
          <div 
            className="px-3 py-1 rounded-full text-xs font-medium"
            style={{
              background: 'oklch(0.2 0.03 260 / 0.8)',
              border: '1px solid oklch(0.35 0.05 260 / 0.5)',
              color: 'oklch(0.85 0.1 200)',
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
          className={`${isExpanded ? 'w-48 h-48 md:w-64 md:h-64' : 'w-32 h-32 md:w-40 md:h-40'}`}
        />

        {/* Audio wave visualization */}
        <div className="flex items-center justify-center gap-0.5 mt-6 h-8">
          {Array.from({ length: 20 }).map((_, i) => (
            <motion.div
              key={i}
              className="w-1 rounded-full"
              style={{
                background: `linear-gradient(180deg, oklch(0.7 0.18 200) 0%, oklch(0.5 0.15 220) 100%)`,
              }}
              animate={{
                height: presenceState === 'speaking' || presenceState === 'listening'
                  ? [4, 8 + Math.random() * 20, 4]
                  : 4,
                opacity: presenceState === 'speaking' || presenceState === 'listening'
                  ? [0.3, 0.8, 0.3]
                  : 0.2,
              }}
              transition={{
                duration: 0.3 + Math.random() * 0.2,
                repeat: Infinity,
                delay: i * 0.03,
              }}
            />
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="relative flex items-center justify-center gap-4 px-4 py-4 border-t border-border/30">
        <motion.button
          className="flex items-center justify-center w-12 h-12 rounded-full"
          style={{
            background: isMuted ? 'oklch(0.5 0.2 25)' : 'oklch(0.18 0.03 260)',
            border: '1px solid oklch(0.3 0.04 260 / 0.5)',
          }}
          whileHover={{ scale: 1.05, boxShadow: '0 0 20px oklch(0.7 0.18 200 / 0.3)' }}
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
          className="flex items-center justify-center w-14 h-14 rounded-full"
          style={{
            background: 'linear-gradient(135deg, oklch(0.5 0.22 25) 0%, oklch(0.4 0.2 20) 100%)',
            boxShadow: '0 4px 20px oklch(0.5 0.2 25 / 0.4)',
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onEndCall}
        >
          <PhoneOff className="w-6 h-6 text-foreground" />
        </motion.button>

        <motion.button
          className="flex items-center justify-center w-12 h-12 rounded-full"
          style={{
            background: 'oklch(0.18 0.03 260)',
            border: '1px solid oklch(0.3 0.04 260 / 0.5)',
          }}
          whileHover={{ scale: 1.05, boxShadow: '0 0 20px oklch(0.7 0.18 200 / 0.3)' }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsSpeakerOn(!isSpeakerOn)}
        >
          {isSpeakerOn ? (
            <Volume2 className="w-5 h-5 text-foreground" />
          ) : (
            <VolumeX className="w-5 h-5 text-foreground" />
          )}
        </motion.button>

        {/* Expand button */}
        <motion.button
          className="absolute right-4 flex items-center justify-center w-8 h-8 rounded-lg"
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
