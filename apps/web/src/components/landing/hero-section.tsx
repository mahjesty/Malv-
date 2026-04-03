import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Play, Sparkles, Zap } from "lucide-react";
import { getMalvRegionProps } from "@/lib/studio/malvRegion";

const heroLabels = (
  <>
    <div className="glass-ultra px-3 py-1.5 rounded-lg text-xs animate-float inline-flex items-center gap-2">
      <Zap className="w-3 h-3 text-accent shrink-0" />
      <span>Neural Engine</span>
    </div>
    <div className="glass-ultra px-3 py-1.5 rounded-lg text-xs animate-float inline-flex items-center gap-2" style={{ animationDelay: "-2s" }}>
      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
      <span>Active Learning</span>
    </div>
  </>
);

// 3D Rotating cube component
function HolographicCube() {
  return (
    <div className="w-full h-full flex items-center justify-center perspective-1000">
      <div className="relative w-32 h-32 md:w-48 md:h-48 preserve-3d animate-float-3d">
        {/* Cube faces */}
        {[
          { transform: "translateZ(60px) md:translateZ(96px)", opacity: "0.3" },
          { transform: "rotateY(180deg) translateZ(60px)", opacity: "0.2" },
          { transform: "rotateY(90deg) translateZ(60px)", opacity: "0.25" },
          { transform: "rotateY(-90deg) translateZ(60px)", opacity: "0.25" },
          { transform: "rotateX(90deg) translateZ(60px)", opacity: "0.2" },
          { transform: "rotateX(-90deg) translateZ(60px)", opacity: "0.2" },
        ].map((face, i) => (
          <div
            key={i}
            className="absolute inset-0 border border-accent/30 bg-accent/5 backdrop-blur-sm"
            style={{ transform: face.transform, opacity: face.opacity }}
          />
        ))}
        
        {/* Core glow */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 md:w-24 md:h-24 rounded-full bg-accent/20 blur-xl animate-pulse-glow" />
          <div className="absolute w-12 h-12 md:w-16 md:h-16 rounded-full bg-accent/40 blur-lg animate-pulse-glow" style={{ animationDelay: "-1s" }} />
          <div className="absolute w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-accent to-accent/50 flex items-center justify-center glow-lg">
            <span className="text-lg md:text-2xl font-bold text-background">m</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Animated orbital ring
function OrbitalRing({ radius, duration, reverse = false, children }: { 
  radius: number; 
  duration: number; 
  reverse?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div 
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent/10"
      style={{ width: radius * 2, height: radius * 2 }}
    >
      <div 
        className="absolute w-full h-full"
        style={{ 
          animation: `orbit ${duration}s linear infinite ${reverse ? "reverse" : ""}`,
        }}
      >
        {children}
      </div>
    </div>
  )
}

// Energy pulse effect
function EnergyPulse({ delay = 0 }: { delay?: number }) {
  return (
    <div 
      className="absolute inset-0 rounded-full border border-accent/30 animate-energy-wave"
      style={{ animationDelay: `${delay}s` }}
    />
  )
}

export function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null)
  const heroVisualRef = useRef<HTMLDivElement>(null)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [isHovering, setIsHovering] = useState(false)

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left - rect.width / 2) / rect.width
    const y = (e.clientY - rect.top - rect.height / 2) / rect.height
    setMousePosition({ x: x * 30, y: y * 30 })
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (container) {
      container.addEventListener("mousemove", handleMouseMove, { passive: true })
    }
    return () => {
      if (container) {
        container.removeEventListener("mousemove", handleMouseMove)
      }
    }
  }, [handleMouseMove])

  return (
    <section
      ref={containerRef}
      {...getMalvRegionProps({
        region: "hero",
        id: "landing.hero.primary",
        label: "Hero Section",
        type: "hero"
      })}
      className="relative min-h-[100dvh] min-h-screen flex items-center justify-center overflow-x-clip overflow-y-visible pt-[max(6rem,env(safe-area-inset-top)+4.5rem)] pb-20 sm:pb-24"
    >
      {/* Spotlight effect that follows mouse */}
      <div 
        className="absolute inset-0 pointer-events-none transition-opacity duration-500"
        style={{
          background: `radial-gradient(600px circle at ${50 + mousePosition.x}% ${50 + mousePosition.y}%, rgba(56, 189, 248, 0.06), transparent 60%)`,
        }}
      />

      {/* Animated border lines */}
      <div className="absolute top-20 left-8 md:left-16 w-px h-32 md:h-48">
        <div className="w-full h-full bg-gradient-to-b from-accent/50 via-accent/20 to-transparent animate-fade-in-up opacity-0 stagger-3" />
      </div>
      <div className="absolute top-20 right-8 md:right-16 w-px h-32 md:h-48">
        <div className="w-full h-full bg-gradient-to-b from-accent/50 via-accent/20 to-transparent animate-fade-in-up opacity-0 stagger-3" />
      </div>

      {/* Main content */}
      <div className="container mx-auto max-w-7xl px-4 sm:px-5 md:px-6 relative z-10">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-8 items-center">
          {/* Text — first on mobile */}
          <div className="text-center lg:text-left order-1 lg:order-1 w-full min-w-0">
            {/* Badge */}
            <div className="inline-flex flex-wrap items-center justify-center lg:justify-start gap-x-2 gap-y-1.5 px-3 sm:px-4 py-2 mb-6 md:mb-8 glass-ultra rounded-full text-xs sm:text-sm animate-fade-in-up opacity-0 group cursor-pointer hover:border-accent/30 transition-colors max-w-full">
              <div className="relative">
                <Sparkles className="w-4 h-4 text-accent" />
                <div className="absolute inset-0 bg-accent/50 blur-md opacity-50" />
              </div>
              <span className="text-muted-foreground">Introducing malv 2.0</span>
              <div className="w-px h-4 bg-border" />
              <span className="text-accent group-hover:text-accent/80 transition-colors flex items-center gap-1">
                Learn more
                <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-[2rem] leading-[1.1] sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 md:mb-8 px-0.5">
              <span 
                className="block animate-fade-in-up opacity-0 stagger-1 text-balance"
              >
                The Future of
              </span>
              <span 
                className="block mt-2 animate-fade-in-up opacity-0 stagger-2 relative"
              >
                <span className="text-gradient-animated neon-text">
                  AI Intelligence
                </span>
              </span>
            </h1>

            {/* Subheadline */}
            <p className="text-[0.9375rem] sm:text-lg md:text-xl text-muted-foreground max-w-xl mx-auto lg:mx-0 mb-8 md:mb-10 animate-fade-in-up opacity-0 stagger-3 text-pretty leading-relaxed">
              Experience the next generation of artificial intelligence. malv delivers 
              unparalleled performance, creativity, and understanding in a single unified platform.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3 sm:gap-4 animate-fade-in-up opacity-0 stagger-4 w-full max-w-md mx-auto lg:max-w-none lg:mx-0">
              <Button
                size="lg"
                className="w-full sm:w-auto min-h-[48px] bg-foreground text-background hover:bg-foreground/90 text-base px-8 py-6 group relative overflow-hidden glow-border"
                asChild
              >
                <Link to="/auth/signup">
                  <div className="relative flex w-full items-center justify-center">
                    <span className="relative z-10 flex items-center font-semibold">
                      Start Building
                      <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-accent/20 via-accent/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto min-h-[48px] border-border/50 hover:border-accent/50 hover:bg-accent/5 text-base px-8 py-6 group glass"
              >
                <Play className="mr-2 w-5 h-5 text-accent group-hover:scale-110 transition-transform" />
                Watch Demo
              </Button>
            </div>

            {/* Stats row */}
            <div className="mt-10 md:mt-12 flex flex-wrap items-center justify-center lg:justify-start gap-6 md:gap-8 animate-fade-in-up opacity-0 stagger-5">
              {[
                { value: "10M+", label: "API Calls/day" },
                { value: "99.9%", label: "Uptime" },
                { value: "<50ms", label: "Latency" },
              ].map((stat, i) => (
                <div key={i} className="text-center lg:text-left">
                  <div className="text-2xl md:text-3xl font-bold text-accent neon-text">{stat.value}</div>
                  <div className="text-xs md:text-sm text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Visual — second on mobile */}
          <div
            ref={heroVisualRef}
            className="order-2 lg:order-2 relative animate-fade-in-up opacity-0 stagger-2 w-full min-w-0"
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            <div className="relative aspect-square max-w-[min(100%,20rem)] sm:max-w-md mx-auto w-full scale-[0.78] sm:scale-90 md:scale-100 origin-center">
              <div
                className="w-full h-full"
                style={{
                  transform: `perspective(1000px) rotateY(${mousePosition.x * 0.3}deg) rotateX(${-mousePosition.y * 0.3}deg)`,
                  transition: "transform 0.1s ease-out",
                }}
              >
              {/* Outer orbital rings */}
              <OrbitalRing radius={200} duration={25}>
                <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-accent/60 glow-sm" />
              </OrbitalRing>
              <OrbitalRing radius={160} duration={18} reverse>
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-accent/40" />
              </OrbitalRing>
              <OrbitalRing radius={120} duration={12}>
                <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-accent/80 glow-sm" />
              </OrbitalRing>

              {/* Central holographic display */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className={`relative w-48 h-48 md:w-64 md:h-64 transition-transform duration-500 ${isHovering ? "scale-105" : ""}`}>
                  {/* Energy pulses */}
                  <EnergyPulse delay={0} />
                  <EnergyPulse delay={0.5} />
                  <EnergyPulse delay={1} />
                  
                  {/* Holographic cube */}
                  <HolographicCube />
                  
                  {/* Decorative circuit lines */}
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 200">
                    <defs>
                      <linearGradient id="circuitGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="rgba(56, 189, 248, 0.8)" />
                        <stop offset="100%" stopColor="rgba(56, 189, 248, 0)" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M 20 100 L 50 100 L 60 90 L 80 90"
                      fill="none"
                      stroke="url(#circuitGrad)"
                      strokeWidth="1"
                      className="animate-draw-line"
                    />
                    <path
                      d="M 180 100 L 150 100 L 140 110 L 120 110"
                      fill="none"
                      stroke="url(#circuitGrad)"
                      strokeWidth="1"
                      className="animate-draw-line"
                      style={{ animationDelay: "0.3s" }}
                    />
                    <path
                      d="M 100 20 L 100 50 L 90 60 L 90 80"
                      fill="none"
                      stroke="url(#circuitGrad)"
                      strokeWidth="1"
                      className="animate-draw-line"
                      style={{ animationDelay: "0.6s" }}
                    />
                    <path
                      d="M 100 180 L 100 150 L 110 140 L 110 120"
                      fill="none"
                      stroke="url(#circuitGrad)"
                      strokeWidth="1"
                      className="animate-draw-line"
                      style={{ animationDelay: "0.9s" }}
                    />
                  </svg>
                </div>
              </div>

              {/* Floating tech labels — desktop */}
              <div className="absolute top-8 right-0 glass-ultra px-3 py-1.5 rounded-lg text-xs animate-float hidden md:block" style={{ animationDelay: "-2s" }}>
                <div className="flex items-center gap-2">
                  <Zap className="w-3 h-3 text-accent" />
                  <span>Neural Engine</span>
                </div>
              </div>
              <div className="absolute bottom-16 left-0 glass-ultra px-3 py-1.5 rounded-lg text-xs animate-float hidden md:block" style={{ animationDelay: "-4s" }}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span>Active Learning</span>
                </div>
              </div>
              </div>
            </div>

            {/* Same labels — mobile row (no clipping) */}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 md:hidden">{heroLabels}</div>

            {/* Reflection */}
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-48 h-24 bg-accent/10 rounded-full blur-3xl pointer-events-none" />
          </div>
        </div>

        {/* Trusted by */}
        <div className="mt-12 sm:mt-16 md:mt-24 text-center animate-fade-in-up opacity-0 stagger-6 px-1">
          <p className="text-xs text-muted-foreground mb-4 sm:mb-6 uppercase tracking-widest">Trusted by industry leaders</p>
          <div className="flex items-center justify-center gap-x-6 gap-y-3 sm:gap-8 md:gap-12 flex-wrap opacity-40 max-w-2xl mx-auto">
            {["Google", "Meta", "OpenAI", "Microsoft", "Amazon"].map((company) => (
              <div key={company} className="text-sm sm:text-lg md:text-xl font-semibold tracking-tight text-muted-foreground/60 hover:text-muted-foreground transition-colors">
                {company}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scroll indicator — all viewports */}
      <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 animate-fade-in-up opacity-0 stagger-6 pb-1">
        <div className="flex flex-col items-center gap-2">
          <span className="text-[10px] text-muted-foreground uppercase tracking-[0.2em]">Scroll to explore</span>
          <div className="w-5 h-9 rounded-full border border-muted-foreground/30 flex justify-center pt-2 relative overflow-hidden">
            <div className="w-0.5 h-2 bg-accent rounded-full animate-bounce" />
          </div>
        </div>
      </div>
    </section>
  )
}
