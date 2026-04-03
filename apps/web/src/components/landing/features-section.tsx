
import { useRef, useEffect, useState, useCallback } from "react"
import { Zap, Shield, Cpu, Layers, Globe, Lock, ArrowUpRight } from "lucide-react";
import { LANDING_SECTION_IO } from "@/lib/landingObserver";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: Zap,
    title: "Lightning Fast",
    description: "Process millions of tokens per second with our optimized inference engine built on custom silicon.",
    metric: "10x faster",
    color: "from-amber-500/20 to-orange-500/20",
    iconColor: "text-amber-400",
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    description: "SOC 2 Type II compliant with end-to-end encryption, data isolation, and zero-knowledge architecture.",
    metric: "99.99% uptime",
    color: "from-emerald-500/20 to-teal-500/20",
    iconColor: "text-emerald-400",
  },
  {
    icon: Cpu,
    title: "Advanced Reasoning",
    description: "Multi-step reasoning capabilities with chain-of-thought processing for complex problem solving.",
    metric: "200B params",
    color: "from-violet-500/20 to-purple-500/20",
    iconColor: "text-violet-400",
  },
  {
    icon: Layers,
    title: "Multimodal",
    description: "Process text, images, code, and audio in a single unified model with cross-modal understanding.",
    metric: "4 modalities",
    color: "from-blue-500/20 to-cyan-500/20",
    iconColor: "text-blue-400",
  },
  {
    icon: Globe,
    title: "Global Scale",
    description: "Deployed across 100+ edge locations with intelligent routing for minimal latency worldwide.",
    metric: "<50ms latency",
    color: "from-rose-500/20 to-pink-500/20",
    iconColor: "text-rose-400",
  },
  {
    icon: Lock,
    title: "Privacy First",
    description: "Your data never trains our models. Full data ownership guaranteed with on-premise options.",
    metric: "Zero retention",
    color: "from-cyan-500/20 to-sky-500/20",
    iconColor: "text-cyan-400",
  },
]

function FeatureCard({ feature, index, isVisible }: { 
  feature: typeof features[0]; 
  index: number; 
  isVisible: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [isHovered, setIsHovered] = useState(false)

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    setMousePos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    })
  }, [])

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "group relative p-6 md:p-8 rounded-2xl glass-ultra cursor-pointer overflow-hidden transition-all duration-500",
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
      )}
      style={{ transitionDelay: `${200 + index * 80}ms` }}
    >
      {/* Spotlight effect */}
      <div 
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background: `radial-gradient(400px circle at ${mousePos.x}% ${mousePos.y}%, rgba(56, 189, 248, 0.1), transparent 50%)`,
        }}
      />

      {/* Gradient background on hover */}
      <div className={cn(
        "absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-500",
        feature.color
      )} />

      {/* Border glow */}
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div className="absolute inset-[-1px] rounded-2xl bg-gradient-to-br from-accent/50 via-transparent to-accent/30" style={{ padding: "1px" }}>
          <div className="w-full h-full rounded-2xl bg-card" />
        </div>
      </div>

      <div className="relative z-10">
        {/* Icon with animated background */}
        <div className="relative w-14 h-14 mb-6">
          <div className={cn(
            "absolute inset-0 rounded-xl bg-gradient-to-br opacity-20 group-hover:opacity-40 transition-opacity",
            feature.color
          )} />
          <div className="absolute inset-0 rounded-xl bg-accent/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <feature.icon className={cn("w-7 h-7", feature.iconColor)} />
          </div>
          {/* Pulse ring */}
          <div className={cn(
            "absolute inset-0 rounded-xl border-2 opacity-0 group-hover:opacity-100 scale-100 group-hover:scale-150 transition-all duration-700",
            "border-accent/20"
          )} />
        </div>

        {/* Content */}
        <h3 className="text-xl font-semibold mb-3 group-hover:text-accent transition-colors duration-300">
          {feature.title}
        </h3>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          {feature.description}
        </p>

        {/* Footer with metric */}
        <div className="flex items-center justify-between pt-4 border-t border-border/50">
          <div className="flex items-center gap-2">
            <div className={cn("w-2 h-2 rounded-full animate-pulse", feature.iconColor.replace("text-", "bg-"))} />
            <span className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
              {feature.metric}
            </span>
          </div>
          <div className="w-10 h-10 rounded-full border border-border/50 flex items-center justify-center group-hover:border-accent/50 group-hover:bg-accent/10 transition-all duration-300">
            <ArrowUpRight className={cn(
              "w-4 h-4 text-muted-foreground group-hover:text-accent transition-all duration-300",
              isHovered && "rotate-45"
            )} />
          </div>
        </div>
      </div>

      {/* Corner accent */}
      <div className="absolute top-0 right-0 w-24 h-24 overflow-hidden rounded-tr-2xl">
        <div className={cn(
          "absolute top-0 right-0 w-32 h-32 -translate-y-16 translate-x-16 bg-gradient-to-bl opacity-10 group-hover:opacity-30 transition-opacity duration-500",
          feature.color
        )} />
      </div>
    </div>
  )
}

export function FeaturesSection() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
        }
      },
      LANDING_SECTION_IO
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current)
    }

    return () => observer.disconnect()
  }, [])

  return (
    <section ref={sectionRef} id="features" className="py-16 sm:py-20 md:py-32 relative overflow-x-clip overflow-y-visible">
      {/* Decorative elements */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent" />
      <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent" />
      
      {/* Floating orbs */}
      <div className="absolute top-20 left-10 w-64 h-64 bg-accent/5 rounded-full blur-[100px] animate-float" />
      <div className="absolute bottom-20 right-10 w-48 h-48 bg-accent/5 rounded-full blur-[80px] animate-float" style={{ animationDelay: "-3s" }} />
      
      <div className="container mx-auto px-4 md:px-6 relative z-10">
        {/* Section header */}
        <div className="max-w-3xl mx-auto text-center mb-16 md:mb-24">
          <div
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 mb-6 glass-ultra rounded-full text-sm transition-all duration-700",
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            <div className="relative">
              <span className="w-2 h-2 bg-accent rounded-full block animate-pulse" />
              <span className="absolute inset-0 w-2 h-2 bg-accent rounded-full animate-ping" />
            </div>
            <span className="text-muted-foreground">Core Features</span>
          </div>
          
          <h2
            className={cn(
              "text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6 transition-all duration-700 delay-100 text-balance",
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            Built for the{" "}
            <span className="relative">
              <span className="text-gradient-animated">future</span>
              <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 200 8" fill="none">
                <path 
                  d="M2 6 Q 100 -2 198 6" 
                  stroke="url(#underlineGrad)" 
                  strokeWidth="3" 
                  strokeLinecap="round"
                  className={cn(
                    "transition-all duration-1000 delay-500",
                    isVisible ? "stroke-dashoffset-0" : "stroke-dashoffset-200"
                  )}
                  style={{ strokeDasharray: 200, strokeDashoffset: isVisible ? 0 : 200 }}
                />
                <defs>
                  <linearGradient id="underlineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="rgba(56, 189, 248, 0.8)" />
                    <stop offset="50%" stopColor="rgba(56, 189, 248, 0.4)" />
                    <stop offset="100%" stopColor="rgba(56, 189, 248, 0.8)" />
                  </linearGradient>
                </defs>
              </svg>
            </span>
          </h2>
          
          <p
            className={cn(
              "text-base sm:text-lg md:text-xl text-muted-foreground transition-all duration-700 delay-200 text-pretty leading-relaxed",
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            Everything you need to build intelligent applications at scale.
            No compromises on speed, security, or capability.
          </p>
        </div>

        {/* Features grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
          {features.map((feature, index) => (
            <FeatureCard 
              key={feature.title} 
              feature={feature} 
              index={index} 
              isVisible={isVisible}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
