
import { motion } from 'framer-motion'
import { PresenceProps, stateAnimations } from "./types";

export function HaloPresence({ state, config, audioLevel = 0, className = '' }: PresenceProps) {
  const stateAnim = stateAnimations[state]
  const glowIntensity = config.glowIntensity * stateAnim.glowMultiplier
  const ringCount = 4

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* Ambient background glow */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '140%',
          height: '140%',
          background: `radial-gradient(circle, ${config.glowColor} 0%, transparent 60%)`,
          filter: `blur(${40 * glowIntensity}px)`,
        }}
        animate={{
          opacity: stateAnim.opacity.map(o => o * 0.5 * glowIntensity),
        }}
        transition={{
          duration: config.breathingSpeed,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Concentric halo rings */}
      {Array.from({ length: ringCount }).map((_, i) => {
        const size = 100 - i * 15
        const delay = i * 0.3
        
        return (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: `${size}%`,
              height: `${size}%`,
              border: `${2 - i * 0.3}px solid ${i % 2 === 0 ? config.primaryColor : config.secondaryColor}`,
              opacity: 0.6 - i * 0.1,
            }}
            animate={{
              scale: stateAnim.scale,
              opacity: stateAnim.opacity.map(o => (0.6 - i * 0.1) * o),
            }}
            transition={{
              duration: config.breathingSpeed,
              repeat: Infinity,
              ease: 'easeInOut',
              delay,
            }}
          />
        )
      })}

      {/* Center core - softer, more minimal */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '35%',
          height: '35%',
          background: `radial-gradient(circle, 
            oklch(0.9 0.08 280) 0%, 
            ${config.primaryColor} 60%,
            transparent 100%)`,
          boxShadow: `0 0 ${40 * glowIntensity}px ${config.glowColor}`,
        }}
        animate={{
          scale: state === 'speaking' 
            ? [1, 1.2 + audioLevel * 0.3, 1]
            : stateAnim.scale,
        }}
        transition={{
          duration: state === 'speaking' ? config.pulseSpeed : config.breathingSpeed,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Pulsing outer halo for speaking */}
      {state === 'speaking' && (
        <motion.div
          className="absolute rounded-full"
          style={{
            width: '110%',
            height: '110%',
            border: `3px solid ${config.primaryColor}`,
          }}
          initial={{ scale: 0.9, opacity: 0.8 }}
          animate={{
            scale: [0.9, 1.2],
            opacity: [0.8, 0],
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
            ease: 'easeOut',
          }}
        />
      )}

      {/* Thinking scan effect */}
      {state === 'thinking' && (
        <motion.div
          className="absolute rounded-full overflow-hidden"
          style={{
            width: '100%',
            height: '100%',
          }}
        >
          <motion.div
            className="absolute w-full h-1"
            style={{
              background: `linear-gradient(90deg, transparent, ${config.primaryColor}, transparent)`,
              filter: 'blur(2px)',
            }}
            animate={{
              top: ['0%', '100%'],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
        </motion.div>
      )}

      {/* Listening ripples */}
      {state === 'listening' && (
        <>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                width: '80%',
                height: '80%',
                border: `1px solid ${config.primaryColor}`,
              }}
              initial={{ scale: 0.8, opacity: 0.6 }}
              animate={{
                scale: [0.8, 1.3],
                opacity: [0.6, 0],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: i * 0.6,
                ease: 'easeOut',
              }}
            />
          ))}
        </>
      )}
    </div>
  )
}
