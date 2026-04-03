
import { motion } from 'framer-motion'
import { PresenceProps, stateAnimations } from "./types";
import { useMemo } from 'react'

export function NeuralPresence({ state, config, audioLevel = 0, className = '' }: PresenceProps) {
  const stateAnim = stateAnimations[state]
  const glowIntensity = config.glowIntensity * stateAnim.glowMultiplier

  // Generate neural network nodes
  const nodes = useMemo(() => {
    const nodeCount = config.particleCount
    return Array.from({ length: nodeCount }).map((_, i) => {
      const angle = (i / nodeCount) * Math.PI * 2
      const radius = 35 + Math.random() * 15
      return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        size: 3 + Math.random() * 3,
        delay: Math.random() * 2,
      }
    })
  }, [config.particleCount])

  // Generate connections between nodes
  const connections = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = []
    for (let i = 0; i < nodes.length; i++) {
      const next = (i + 1) % nodes.length
      const skip = (i + 3) % nodes.length
      lines.push({ x1: nodes[i].x, y1: nodes[i].y, x2: nodes[next].x, y2: nodes[next].y })
      if (i % 2 === 0) {
        lines.push({ x1: nodes[i].x, y1: nodes[i].y, x2: nodes[skip].x, y2: nodes[skip].y })
      }
    }
    return lines
  }, [nodes])

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* Ambient glow */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '130%',
          height: '130%',
          background: `radial-gradient(circle, ${config.glowColor} 0%, transparent 70%)`,
          filter: `blur(${40 * glowIntensity}px)`,
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

      {/* Neural network SVG */}
      <svg
        className="absolute w-full h-full"
        viewBox="-60 -60 120 120"
        style={{ overflow: 'visible' }}
      >
        {/* Connection lines */}
        {connections.map((line, i) => (
          <motion.line
            key={`line-${i}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={config.primaryColor}
            strokeWidth={0.5}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{
              pathLength: [0, 1, 1, 0],
              opacity: state === 'thinking' || state === 'speaking'
                ? [0.2, 0.6, 0.6, 0.2]
                : [0.1, 0.3, 0.3, 0.1],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              delay: i * 0.15,
              ease: 'easeInOut',
            }}
          />
        ))}

        {/* Neural nodes */}
        {nodes.map((node, i) => (
          <motion.circle
            key={`node-${i}`}
            cx={node.x}
            cy={node.y}
            r={node.size}
            fill={config.primaryColor}
            initial={{ opacity: 0.3, scale: 0.8 }}
            animate={{
              opacity: state === 'speaking' 
                ? [0.4, 1, 0.4]
                : [0.3, 0.7, 0.3],
              scale: state === 'speaking'
                ? [0.8, 1.3 + audioLevel * 0.3, 0.8]
                : [0.8, 1.1, 0.8],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              delay: node.delay,
              ease: 'easeInOut',
            }}
            style={{
              filter: `drop-shadow(0 0 ${4 * glowIntensity}px ${config.glowColor})`,
            }}
          />
        ))}

        {/* Data pulses traveling along connections (thinking state) */}
        {state === 'thinking' && connections.slice(0, 6).map((line, i) => (
          <motion.circle
            key={`pulse-${i}`}
            r={2}
            fill={config.secondaryColor}
            initial={{ opacity: 0 }}
            animate={{
              cx: [line.x1, line.x2],
              cy: [line.y1, line.y2],
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: i * 0.3,
              ease: 'linear',
            }}
            style={{
              filter: `drop-shadow(0 0 6px ${config.glowColor})`,
            }}
          />
        ))}
      </svg>

      {/* Center core */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '35%',
          height: '35%',
          background: `radial-gradient(circle at 40% 40%,
            oklch(0.9 0.1 270) 0%,
            ${config.primaryColor} 50%,
            ${config.secondaryColor} 100%)`,
          boxShadow: `
            0 0 ${30 * glowIntensity}px ${config.glowColor},
            inset 0 3px 10px oklch(1 0 0 / 0.2)
          `,
        }}
        animate={{
          scale: stateAnim.scale.map(s => s * (1 + audioLevel * 0.1)),
        }}
        transition={{
          duration: config.breathingSpeed,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Inner neural pulse */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '15%',
          height: '15%',
          background: `radial-gradient(circle, oklch(1 0 0) 0%, ${config.primaryColor} 100%)`,
          filter: 'blur(2px)',
        }}
        animate={{
          scale: [1, 1.4, 1],
          opacity: [0.6, 1, 0.6],
        }}
        transition={{
          duration: config.pulseSpeed,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Rotating outer ring */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '90%',
          height: '90%',
          border: `1px dashed ${config.primaryColor}`,
          opacity: 0.3,
        }}
        animate={{ rotate: 360 }}
        transition={{
          duration: stateAnim.rotationSpeed,
          repeat: Infinity,
          ease: 'linear',
        }}
      />
    </div>
  )
}
