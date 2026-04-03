'use client'

import { motion } from 'framer-motion'
import { PresenceProps, stateAnimations } from '../types'

export function OrbPresence({ state, config, audioLevel = 0, className = '' }: PresenceProps) {
  const stateAnim = stateAnimations[state]
  const glowIntensity = config.glowIntensity * stateAnim.glowMultiplier
  const audioScale = 1 + (audioLevel * 0.15)

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* Outer glow */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '120%',
          height: '120%',
          background: `radial-gradient(circle, ${config.glowColor} 0%, transparent 70%)`,
          filter: `blur(${30 * glowIntensity}px)`,
        }}
        animate={{
          scale: stateAnim.scale,
          opacity: stateAnim.opacity.map(o => o * glowIntensity),
        }}
        transition={{
          duration: config.breathingSpeed,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Rotating outer ring */}
      <motion.div
        className="absolute w-full h-full rounded-full"
        style={{
          border: `2px dashed ${config.primaryColor}`,
          opacity: 0.3,
        }}
        animate={{ rotate: 360 }}
        transition={{
          duration: stateAnim.rotationSpeed,
          repeat: Infinity,
          ease: 'linear',
        }}
      />

      {/* Secondary ring */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '90%',
          height: '90%',
          border: `1px solid ${config.secondaryColor}`,
          opacity: 0.4,
        }}
        animate={{ rotate: -360 }}
        transition={{
          duration: stateAnim.rotationSpeed * 1.5,
          repeat: Infinity,
          ease: 'linear',
        }}
      />

      {/* Main orb shell */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '75%',
          height: '75%',
          background: `radial-gradient(circle at 30% 30%, 
            oklch(1 0 0 / 0.15) 0%, 
            ${config.primaryColor} 40%, 
            ${config.secondaryColor} 100%)`,
          boxShadow: `
            inset 0 0 40px ${config.glowColor},
            inset 0 -20px 40px ${config.secondaryColor},
            0 0 ${60 * glowIntensity}px ${config.glowColor}
          `,
        }}
        animate={{
          scale: stateAnim.scale.map(s => s * audioScale),
        }}
        transition={{
          duration: config.breathingSpeed,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Inner energy core */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '40%',
          height: '40%',
          background: `radial-gradient(circle, 
            oklch(0.95 0.05 200) 0%, 
            ${config.primaryColor} 50%, 
            transparent 100%)`,
          filter: 'blur(4px)',
        }}
        animate={{
          scale: state === 'speaking' ? [1, 1.3, 1] : [1, 1.1, 1],
          opacity: [0.6, 1, 0.6],
        }}
        transition={{
          duration: config.pulseSpeed,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Highlight reflection */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '30%',
          height: '15%',
          top: '22%',
          left: '25%',
          background: 'linear-gradient(180deg, oklch(1 0 0 / 0.4) 0%, transparent 100%)',
          borderRadius: '50%',
          filter: 'blur(3px)',
        }}
        animate={{
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Audio reactive particles */}
      {state === 'speaking' && (
        <>
          {Array.from({ length: config.particleCount }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1.5 h-1.5 rounded-full"
              style={{
                background: config.primaryColor,
                boxShadow: `0 0 6px ${config.glowColor}`,
              }}
              initial={{
                x: 0,
                y: 0,
                opacity: 0,
              }}
              animate={{
                x: [0, Math.cos((i / config.particleCount) * Math.PI * 2) * 80],
                y: [0, Math.sin((i / config.particleCount) * Math.PI * 2) * 80],
                opacity: [0, 1, 0],
                scale: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.15,
                ease: 'easeOut',
              }}
            />
          ))}
        </>
      )}
    </div>
  )
}
