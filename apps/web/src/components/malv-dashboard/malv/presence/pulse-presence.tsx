
import { motion } from 'framer-motion'
import { PresenceProps, stateAnimations } from '../types'

export function PulsePresence({ state, config, audioLevel = 0, className = '' }: PresenceProps) {
  const stateAnim = stateAnimations[state]
  const glowIntensity = config.glowIntensity * stateAnim.glowMultiplier
  const pulseCount = 5

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* Deep ambient glow */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '150%',
          height: '150%',
          background: `radial-gradient(circle, ${config.glowColor} 0%, transparent 60%)`,
          filter: `blur(${50 * glowIntensity}px)`,
        }}
        animate={{
          opacity: stateAnim.opacity.map(o => o * 0.5 * glowIntensity),
          scale: [1, 1.1, 1],
        }}
        transition={{
          duration: config.pulseSpeed * 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Expanding pulse waves */}
      {Array.from({ length: pulseCount }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: '60%',
            height: '60%',
            border: `2px solid ${config.primaryColor}`,
          }}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{
            scale: [0.5, 1.8],
            opacity: [0.8, 0],
          }}
          transition={{
            duration: config.pulseSpeed * 1.5,
            repeat: Infinity,
            delay: i * (config.pulseSpeed * 1.5 / pulseCount),
            ease: 'easeOut',
          }}
        />
      ))}

      {/* Core energy sphere */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '50%',
          height: '50%',
          background: `radial-gradient(circle at 35% 35%,
            oklch(0.95 0.1 200) 0%,
            ${config.primaryColor} 40%,
            ${config.secondaryColor} 80%,
            oklch(0.3 0.15 200) 100%)`,
          boxShadow: `
            0 0 ${50 * glowIntensity}px ${config.glowColor},
            0 0 ${100 * glowIntensity}px ${config.glowColor},
            inset 0 5px 15px oklch(1 0 0 / 0.3)
          `,
        }}
        animate={{
          scale: state === 'speaking'
            ? [1, 1.25 + audioLevel * 0.3, 1]
            : stateAnim.scale,
        }}
        transition={{
          duration: state === 'speaking' ? config.pulseSpeed * 0.5 : config.pulseSpeed,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Inner bright core */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '20%',
          height: '20%',
          background: `radial-gradient(circle, 
            oklch(1 0 0) 0%, 
            ${config.primaryColor} 70%, 
            transparent 100%)`,
          filter: 'blur(2px)',
        }}
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.8, 1, 0.8],
        }}
        transition={{
          duration: config.pulseSpeed,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Radial energy bars for speaking */}
      {(state === 'speaking' || state === 'listening') && (
        <>
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i / 12) * 360
            const audioMultiplier = state === 'speaking' ? 1 + audioLevel : 0.7
            
            return (
              <motion.div
                key={i}
                className="absolute"
                style={{
                  width: '3px',
                  height: '15%',
                  background: `linear-gradient(0deg, ${config.primaryColor}, transparent)`,
                  transformOrigin: 'center bottom',
                  bottom: '50%',
                  left: '50%',
                  marginLeft: '-1.5px',
                  rotate: `${angle}deg`,
                  filter: 'blur(0.5px)',
                }}
                animate={{
                  scaleY: [0.5, audioMultiplier * (0.8 + Math.sin(i) * 0.4), 0.5],
                  opacity: [0.4, 0.9, 0.4],
                }}
                transition={{
                  duration: 0.3 + Math.random() * 0.2,
                  repeat: Infinity,
                  delay: i * 0.05,
                  ease: 'easeInOut',
                }}
              />
            )
          })}
        </>
      )}

      {/* Thinking rotation indicator */}
      {state === 'thinking' && (
        <motion.div
          className="absolute rounded-full"
          style={{
            width: '70%',
            height: '70%',
            borderTop: `3px solid ${config.primaryColor}`,
            borderRight: `3px solid transparent`,
            borderBottom: `3px solid transparent`,
            borderLeft: `3px solid transparent`,
          }}
          animate={{ rotate: 360 }}
          transition={{
            duration: 1,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      )}
    </div>
  )
}
