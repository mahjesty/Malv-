'use client'

import { motion } from 'framer-motion'
import { PresenceProps, stateAnimations } from '../types'

export function HolographicPresence({ state, config, audioLevel = 0, className = '' }: PresenceProps) {
  const stateAnim = stateAnimations[state]
  const glowIntensity = config.glowIntensity * stateAnim.glowMultiplier

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* Multi-color ambient glow */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '140%',
          height: '140%',
          background: `conic-gradient(from 0deg, 
            ${config.glowColor}, 
            oklch(0.6 0.15 280 / 0.3), 
            ${config.glowColor}, 
            oklch(0.7 0.12 200 / 0.3),
            ${config.glowColor})`,
          filter: `blur(${45 * glowIntensity}px)`,
        }}
        animate={{
          rotate: 360,
          opacity: stateAnim.opacity.map(o => o * 0.4 * glowIntensity),
        }}
        transition={{
          rotate: {
            duration: 20,
            repeat: Infinity,
            ease: 'linear',
          },
          opacity: {
            duration: config.breathingSpeed,
            repeat: Infinity,
            ease: 'easeInOut',
          },
        }}
      />

      {/* Holographic scan lines container */}
      <motion.div
        className="absolute rounded-full overflow-hidden"
        style={{
          width: '85%',
          height: '85%',
          background: 'transparent',
        }}
        animate={{
          scale: stateAnim.scale,
        }}
        transition={{
          duration: config.breathingSpeed,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        {/* Horizontal scan lines */}
        {Array.from({ length: 20 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-full"
            style={{
              height: '1px',
              top: `${(i / 20) * 100}%`,
              background: `linear-gradient(90deg, 
                transparent 0%, 
                ${config.primaryColor} 30%, 
                ${config.secondaryColor} 70%, 
                transparent 100%)`,
              opacity: 0.15,
            }}
            animate={{
              opacity: state === 'speaking' ? [0.1, 0.3, 0.1] : 0.15,
            }}
            transition={{
              duration: 0.5,
              repeat: Infinity,
              delay: i * 0.03,
            }}
          />
        ))}
      </motion.div>

      {/* Outer holographic ring */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '95%',
          height: '95%',
          background: `conic-gradient(from 0deg,
            ${config.primaryColor} 0%,
            transparent 10%,
            ${config.secondaryColor} 25%,
            transparent 35%,
            ${config.primaryColor} 50%,
            transparent 60%,
            ${config.secondaryColor} 75%,
            transparent 85%,
            ${config.primaryColor} 100%)`,
          opacity: 0.5,
        }}
        animate={{ rotate: -360 }}
        transition={{
          duration: stateAnim.rotationSpeed,
          repeat: Infinity,
          ease: 'linear',
        }}
      />

      {/* Inner holographic ring */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '75%',
          height: '75%',
          background: `conic-gradient(from 180deg,
            transparent 0%,
            ${config.primaryColor} 15%,
            transparent 30%,
            ${config.secondaryColor} 45%,
            transparent 60%,
            ${config.primaryColor} 75%,
            transparent 90%)`,
          opacity: 0.4,
        }}
        animate={{ rotate: 360 }}
        transition={{
          duration: stateAnim.rotationSpeed * 0.8,
          repeat: Infinity,
          ease: 'linear',
        }}
      />

      {/* Core hologram */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '50%',
          height: '50%',
          background: `radial-gradient(circle at 40% 35%,
            oklch(0.95 0.05 220) 0%,
            ${config.primaryColor} 30%,
            ${config.secondaryColor} 70%,
            oklch(0.3 0.1 260) 100%)`,
          boxShadow: `
            0 0 ${40 * glowIntensity}px ${config.glowColor},
            inset 0 5px 20px oklch(1 0 0 / 0.25)
          `,
        }}
        animate={{
          scale: state === 'speaking'
            ? [1, 1.15 + audioLevel * 0.2, 1]
            : stateAnim.scale,
        }}
        transition={{
          duration: state === 'speaking' ? config.pulseSpeed : config.breathingSpeed,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Holographic glitch effect for thinking */}
      {state === 'thinking' && (
        <>
          <motion.div
            className="absolute rounded-full"
            style={{
              width: '52%',
              height: '52%',
              background: config.primaryColor,
              opacity: 0.3,
              filter: 'blur(2px)',
            }}
            animate={{
              x: [-3, 3, -3],
              opacity: [0, 0.4, 0],
            }}
            transition={{
              duration: 0.15,
              repeat: Infinity,
              repeatDelay: 1.5,
            }}
          />
          <motion.div
            className="absolute rounded-full"
            style={{
              width: '52%',
              height: '52%',
              background: config.secondaryColor,
              opacity: 0.3,
              filter: 'blur(2px)',
            }}
            animate={{
              x: [3, -3, 3],
              opacity: [0, 0.4, 0],
            }}
            transition={{
              duration: 0.15,
              repeat: Infinity,
              repeatDelay: 1.5,
              delay: 0.05,
            }}
          />
        </>
      )}

      {/* Central bright core */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '18%',
          height: '18%',
          background: `radial-gradient(circle, oklch(1 0 0) 0%, ${config.primaryColor} 100%)`,
          filter: 'blur(3px)',
        }}
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.7, 1, 0.7],
        }}
        transition={{
          duration: config.pulseSpeed,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Orbiting particles */}
      {(state === 'speaking' || state === 'listening') && (
        <>
          {Array.from({ length: 4 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 rounded-full"
              style={{
                background: i % 2 === 0 ? config.primaryColor : config.secondaryColor,
                boxShadow: `0 0 8px ${config.glowColor}`,
                top: '50%',
                left: '50%',
                marginTop: '-4px',
                marginLeft: '-4px',
              }}
              animate={{
                x: [
                  Math.cos((i / 4) * Math.PI * 2) * 60,
                  Math.cos((i / 4) * Math.PI * 2 + Math.PI * 2) * 60,
                ],
                y: [
                  Math.sin((i / 4) * Math.PI * 2) * 60,
                  Math.sin((i / 4) * Math.PI * 2 + Math.PI * 2) * 60,
                ],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: 'linear',
                delay: i * 0.75,
              }}
            />
          ))}
        </>
      )}
    </div>
  )
}
