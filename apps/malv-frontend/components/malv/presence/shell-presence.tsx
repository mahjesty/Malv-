'use client'

import { motion } from 'framer-motion'
import { PresenceProps, stateAnimations } from '../types'

export function ShellPresence({ state, config, audioLevel = 0, className = '' }: PresenceProps) {
  const stateAnim = stateAnimations[state]
  const glowIntensity = config.glowIntensity * stateAnim.glowMultiplier

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* Soft ambient glow */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '130%',
          height: '130%',
          background: `radial-gradient(circle, ${config.glowColor} 0%, transparent 70%)`,
          filter: `blur(${35 * glowIntensity}px)`,
        }}
        animate={{
          opacity: stateAnim.opacity.map(o => o * 0.4 * glowIntensity),
        }}
        transition={{
          duration: config.breathingSpeed,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Outer glass shell */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '95%',
          height: '95%',
          background: `linear-gradient(135deg, 
            oklch(0.3 0.05 220 / 0.4) 0%, 
            oklch(0.15 0.03 220 / 0.6) 50%,
            oklch(0.2 0.04 220 / 0.5) 100%)`,
          border: `1px solid oklch(0.5 0.08 220 / 0.3)`,
          backdropFilter: 'blur(8px)',
          boxShadow: `
            inset 0 2px 20px oklch(1 0 0 / 0.1),
            inset 0 -10px 30px oklch(0.1 0 0 / 0.3),
            0 0 ${30 * glowIntensity}px ${config.glowColor}
          `,
        }}
        animate={{
          scale: stateAnim.scale,
        }}
        transition={{
          duration: config.breathingSpeed,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Inner floating core */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '55%',
          height: '55%',
          background: `radial-gradient(circle at 40% 35%,
            ${config.primaryColor} 0%,
            ${config.secondaryColor} 60%,
            oklch(0.2 0.1 220) 100%)`,
          boxShadow: `
            0 0 ${25 * glowIntensity}px ${config.glowColor},
            inset 0 5px 15px oklch(1 0 0 / 0.2)
          `,
        }}
        animate={{
          scale: state === 'speaking' 
            ? [1, 1.15 + audioLevel * 0.2, 1]
            : [1, 1.05, 1],
          y: state === 'idle' ? [0, -3, 0] : 0,
        }}
        transition={{
          duration: state === 'speaking' ? config.pulseSpeed : config.breathingSpeed,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Shell highlight - top reflection */}
      <motion.div
        className="absolute"
        style={{
          width: '60%',
          height: '25%',
          top: '8%',
          borderRadius: '50%',
          background: 'linear-gradient(180deg, oklch(1 0 0 / 0.2) 0%, transparent 100%)',
          filter: 'blur(4px)',
        }}
        animate={{
          opacity: [0.4, 0.6, 0.4],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Inner light streams for thinking */}
      {state === 'thinking' && (
        <>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute"
              style={{
                width: '2px',
                height: '40%',
                background: `linear-gradient(180deg, transparent, ${config.primaryColor}, transparent)`,
                filter: 'blur(1px)',
                transformOrigin: 'center center',
              }}
              initial={{ rotate: i * 60, opacity: 0.5 }}
              animate={{
                rotate: [i * 60, i * 60 + 360],
                opacity: [0.3, 0.7, 0.3],
              }}
              transition={{
                rotate: {
                  duration: 4,
                  repeat: Infinity,
                  ease: 'linear',
                },
                opacity: {
                  duration: 1.5,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: i * 0.3,
                },
              }}
            />
          ))}
        </>
      )}

      {/* Floating energy bits for speaking */}
      {state === 'speaking' && (
        <>
          {Array.from({ length: config.particleCount }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 rounded-full"
              style={{
                background: config.primaryColor,
                boxShadow: `0 0 4px ${config.glowColor}`,
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                y: [0, -40 - Math.random() * 20],
                x: [(i - config.particleCount / 2) * 8, (i - config.particleCount / 2) * 15],
                scale: [0, 1, 0],
                opacity: [0, 0.8, 0],
              }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: i * 0.12,
                ease: 'easeOut',
              }}
            />
          ))}
        </>
      )}
    </div>
  )
}
