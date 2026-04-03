
import { useEffect, useRef, useMemo } from "react"

// Neural Network Node component
function NeuralNode({ x, y, delay }: { x: number; y: number; delay: number }) {
  return (
    <g>
      <circle
        cx={x}
        cy={y}
        r="3"
        fill="rgba(56, 189, 248, 0.6)"
        className="animate-neural-pulse"
        style={{ animationDelay: `${delay}s` }}
      />
      <circle
        cx={x}
        cy={y}
        r="8"
        fill="none"
        stroke="rgba(56, 189, 248, 0.2)"
        strokeWidth="1"
        className="animate-energy-wave"
        style={{ animationDelay: `${delay}s` }}
      />
    </g>
  )
}

// Connection line between nodes
function NeuralConnection({ 
  x1, y1, x2, y2, delay 
}: { 
  x1: number; y1: number; x2: number; y2: number; delay: number 
}) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke="url(#neuralGradient)"
      strokeWidth="1"
      strokeOpacity="0.3"
      className="animate-circuit"
      style={{ animationDelay: `${delay}s` }}
    />
  )
}

// Floating particle
function Particle({ index }: { index: number }) {
  const tx = (Math.random() - 0.5) * 200
  const ty = (Math.random() - 0.5) * 200
  const duration = 4 + Math.random() * 8
  const delay = Math.random() * 5
  const size = 1 + Math.random() * 2
  const left = Math.random() * 100
  const top = Math.random() * 100
  
  return (
    <div
      key={index}
      className="absolute rounded-full bg-accent/60 animate-particle"
      style={{
        width: size,
        height: size,
        left: `${left}%`,
        top: `${top}%`,
        "--tx": `${tx}px`,
        "--ty": `${ty}px`,
        "--duration": `${duration}s`,
        "--delay": `${delay}s`,
      } as React.CSSProperties}
    />
  )
}

export function CinematicBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  // Generate neural network nodes
  const neuralNodes = useMemo(() => {
    const nodes = []
    const gridSize = 6
    const spacing = 200
    
    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        const x = 100 + i * spacing + (Math.random() - 0.5) * 50
        const y = 100 + j * spacing + (Math.random() - 0.5) * 50
        nodes.push({ x, y, delay: Math.random() * 4 })
      }
    }
    return nodes
  }, [])

  // Generate connections
  const connections = useMemo(() => {
    const conns = []
    for (let i = 0; i < neuralNodes.length; i++) {
      for (let j = i + 1; j < neuralNodes.length; j++) {
        const dx = neuralNodes[i].x - neuralNodes[j].x
        const dy = neuralNodes[i].y - neuralNodes[j].y
        const distance = Math.sqrt(dx * dx + dy * dy)
        if (distance < 250 && Math.random() > 0.5) {
          conns.push({
            x1: neuralNodes[i].x,
            y1: neuralNodes[i].y,
            x2: neuralNodes[j].x,
            y2: neuralNodes[j].y,
            delay: Math.random() * 3
          })
        }
      }
    }
    return conns
  }, [neuralNodes])

  // Aurora effect using canvas for performance
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animationId: number
    let time = 0

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener("resize", resize)

    const animate = () => {
      time += 0.002
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Create aurora gradient
      const gradient = ctx.createRadialGradient(
        canvas.width / 2 + Math.sin(time) * 200,
        canvas.height / 3 + Math.cos(time * 0.7) * 100,
        0,
        canvas.width / 2,
        canvas.height / 2,
        canvas.width * 0.8
      )
      
      gradient.addColorStop(0, "rgba(56, 189, 248, 0.15)")
      gradient.addColorStop(0.3, "rgba(56, 189, 248, 0.05)")
      gradient.addColorStop(0.6, "rgba(139, 92, 246, 0.03)")
      gradient.addColorStop(1, "transparent")

      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Second aurora layer
      const gradient2 = ctx.createRadialGradient(
        canvas.width * 0.7 + Math.cos(time * 0.8) * 150,
        canvas.height * 0.6 + Math.sin(time * 0.5) * 80,
        0,
        canvas.width * 0.7,
        canvas.height * 0.6,
        canvas.width * 0.5
      )
      
      gradient2.addColorStop(0, "rgba(56, 189, 248, 0.08)")
      gradient2.addColorStop(0.5, "rgba(20, 184, 166, 0.04)")
      gradient2.addColorStop(1, "transparent")

      ctx.fillStyle = gradient2
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      animationId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener("resize", resize)
      cancelAnimationFrame(animationId)
    }
  }, [])

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-secondary/20" />
      
      {/* Aurora canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 opacity-80"
      />
      
      {/* Neural network SVG */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.14] sm:opacity-25 md:opacity-40 pointer-events-none"
        viewBox="0 0 1200 1200"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="neuralGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(56, 189, 248, 0.8)" />
            <stop offset="50%" stopColor="rgba(56, 189, 248, 0.2)" />
            <stop offset="100%" stopColor="rgba(56, 189, 248, 0.8)" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        
        {/* Connections */}
        <g filter="url(#glow)">
          {connections.map((conn, i) => (
            <NeuralConnection key={i} {...conn} />
          ))}
        </g>
        
        {/* Nodes */}
        <g filter="url(#glow)">
          {neuralNodes.map((node, i) => (
            <NeuralNode key={i} {...node} />
          ))}
        </g>
      </svg>

      {/* Cyber grid overlay */}
      <div className="absolute inset-0 cyber-grid opacity-50" />
      
      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(30)].map((_, i) => (
          <Particle key={i} index={i} />
        ))}
      </div>

      {/* Data streams — visible on all sizes; fewer on narrow viewports via CSS */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="absolute w-px bg-gradient-to-b from-transparent via-accent/12 sm:via-accent/18 md:via-accent/20 to-transparent animate-data-stream"
            style={{
              left: `${15 + i * 18}%`,
              height: "30%",
              animationDelay: `${i * 1.5}s`,
              animationDuration: `${6 + i * 2}s`,
            }}
          />
        ))}
      </div>

      {/* Scanline effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.02]">
        <div 
          className="absolute w-full h-px bg-accent animate-scanline"
          style={{ boxShadow: "0 0 20px 10px rgba(56, 189, 248, 0.3)" }}
        />
      </div>

      {/* Vignette */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.4) 100%)"
        }}
      />

      {/* Noise texture */}
      <div className="absolute inset-0 noise-overlay pointer-events-none" />

      {/* Top glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120%] h-[500px] bg-accent/5 rounded-[100%] blur-[100px] -translate-y-1/2" />
      
      {/* Corner accents */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-accent/5 rounded-full blur-[150px] -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-accent/5 rounded-full blur-[150px] translate-x-1/2 translate-y-1/2" />
    </div>
  )
}
