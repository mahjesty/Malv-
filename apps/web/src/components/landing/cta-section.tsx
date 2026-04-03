
import { useRef, useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { LANDING_SECTION_IO } from "@/lib/landingObserver";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Check, Zap, Shield, Globe } from "lucide-react";

const trustBadges = [
  { icon: Check, text: "No credit card required" },
  { icon: Zap, text: "$100 free credits" },
  { icon: Shield, text: "SOC 2 compliant" },
  { icon: Globe, text: "99.99% uptime SLA" },
]

export function CTASection() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 })

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
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    setMousePos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    })
  }, [])

  return (
    <section ref={sectionRef} id="pricing" className="py-16 sm:py-20 md:py-32 relative overflow-x-clip overflow-y-visible">
      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div
          ref={cardRef}
          onMouseMove={handleMouseMove}
          className={cn(
            "relative max-w-5xl mx-auto rounded-3xl overflow-hidden transition-all duration-700",
            isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"
          )}
        >
          {/* Animated gradient background */}
          <div className="absolute inset-0 bg-gradient-to-br from-accent/20 via-background to-violet-500/10" />
          
          {/* Spotlight effect */}
          <div 
            className="absolute inset-0 opacity-50 transition-all duration-300 pointer-events-none"
            style={{
              background: `radial-gradient(600px circle at ${mousePos.x}% ${mousePos.y}%, rgba(56, 189, 248, 0.15), transparent 50%)`,
            }}
          />
          
          {/* Animated orbs */}
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-accent/20 rounded-full blur-[120px] animate-pulse-glow" />
          <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-violet-500/15 rounded-full blur-[100px] animate-pulse-glow" style={{ animationDelay: "-2s" }} />
          
          {/* Glass border */}
          <div className="absolute inset-0 rounded-3xl border border-accent/20" />
          <div className="absolute inset-0 rounded-3xl">
            <div className="absolute inset-[-1px] rounded-3xl bg-gradient-to-br from-accent/40 via-transparent to-violet-500/40" style={{ padding: "1px" }}>
              <div className="w-full h-full rounded-3xl bg-background/80 backdrop-blur-xl" />
            </div>
          </div>
          
          {/* Content */}
          <div className="relative z-10 p-8 md:p-12 lg:p-20 text-center">
            {/* Badge */}
            <div
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 mb-8 glass-ultra rounded-full text-sm transition-all duration-700 delay-200",
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              )}
            >
              <div className="relative">
                <Sparkles className="w-4 h-4 text-accent" />
                <div className="absolute inset-0 bg-accent/50 blur-md" />
              </div>
              <span className="text-muted-foreground">Start free, scale infinitely</span>
            </div>

            {/* Headline */}
            <h2
              className={cn(
                "text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 transition-all duration-700 delay-300 text-balance",
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              )}
            >
              Ready to build the{" "}
              <span className="relative inline-block">
                <span className="text-gradient-animated neon-text">future?</span>
                <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 200 8" fill="none">
                  <path 
                    d="M2 6 Q 100 -2 198 6" 
                    stroke="url(#ctaUnderline)" 
                    strokeWidth="3" 
                    strokeLinecap="round"
                    style={{ 
                      strokeDasharray: 200, 
                      strokeDashoffset: isVisible ? 0 : 200,
                      transition: "stroke-dashoffset 1s ease-out 0.8s"
                    }}
                  />
                  <defs>
                    <linearGradient id="ctaUnderline" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="rgba(56, 189, 248, 0.8)" />
                      <stop offset="50%" stopColor="rgba(139, 92, 246, 0.6)" />
                      <stop offset="100%" stopColor="rgba(56, 189, 248, 0.8)" />
                    </linearGradient>
                  </defs>
                </svg>
              </span>
            </h2>

            {/* Subheadline */}
            <p
              className={cn(
                "text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 transition-all duration-700 delay-400 text-pretty leading-relaxed",
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              )}
            >
              Get started with $100 in free credits. No credit card required.
              Join 50,000+ developers building the next generation of AI applications.
            </p>

            {/* CTA Buttons */}
            <div
              className={cn(
                "flex flex-col sm:flex-row items-center justify-center gap-4 transition-all duration-700 delay-500",
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              )}
            >
              <Button
                size="lg"
                className="w-full sm:w-auto bg-foreground text-background hover:bg-foreground/90 text-base px-10 py-7 group relative overflow-hidden glow-border depth-shadow"
                asChild
              >
                <Link to="/auth/signup">
                  <div className="relative flex w-full items-center justify-center">
                    <span className="relative z-10 flex items-center font-semibold">
                      <Sparkles className="w-5 h-5 mr-2" />
                      Get Started Free
                      <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-accent/30 via-accent/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto border-border/50 hover:border-accent/50 hover:bg-accent/5 text-base px-10 py-7 glass"
              >
                Talk to Sales
              </Button>
            </div>

            {/* Trust badges */}
            <div
              className={cn(
                "mt-12 md:mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 max-w-3xl mx-auto transition-all duration-700 delay-600",
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              )}
            >
              {trustBadges.map((badge, i) => (
                <div 
                  key={i} 
                  className="flex items-center justify-center gap-2 px-4 py-3 glass-ultra rounded-xl hover:bg-accent/5 transition-colors"
                >
                  <badge.icon className="w-4 h-4 text-accent" />
                  <span className="text-xs md:text-sm text-muted-foreground whitespace-nowrap">{badge.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Animated corner accents */}
          <svg className="absolute top-0 left-0 w-32 h-32" viewBox="0 0 100 100" fill="none">
            <path 
              d="M 10 50 L 10 10 L 50 10" 
              stroke="url(#cornerGrad)" 
              strokeWidth="2" 
              strokeLinecap="round"
              className={cn(
                "transition-all duration-1000 delay-700",
                isVisible ? "opacity-100" : "opacity-0"
              )}
              style={{ 
                strokeDasharray: 100, 
                strokeDashoffset: isVisible ? 0 : 100,
                transition: "stroke-dashoffset 1s ease-out 0.7s"
              }}
            />
            <defs>
              <linearGradient id="cornerGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(56, 189, 248, 0.6)" />
                <stop offset="100%" stopColor="rgba(56, 189, 248, 0)" />
              </linearGradient>
            </defs>
          </svg>
          <svg className="absolute bottom-0 right-0 w-32 h-32 rotate-180" viewBox="0 0 100 100" fill="none">
            <path 
              d="M 10 50 L 10 10 L 50 10" 
              stroke="url(#cornerGrad2)" 
              strokeWidth="2" 
              strokeLinecap="round"
              className={cn(
                "transition-all duration-1000 delay-800",
                isVisible ? "opacity-100" : "opacity-0"
              )}
              style={{ 
                strokeDasharray: 100, 
                strokeDashoffset: isVisible ? 0 : 100,
                transition: "stroke-dashoffset 1s ease-out 0.8s"
              }}
            />
            <defs>
              <linearGradient id="cornerGrad2" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(139, 92, 246, 0.6)" />
                <stop offset="100%" stopColor="rgba(139, 92, 246, 0)" />
              </linearGradient>
            </defs>
          </svg>

          {/* Floating particles */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="absolute w-1 h-1 rounded-full bg-accent/60 animate-particle"
                style={{
                  left: `${10 + i * 12}%`,
                  top: `${20 + (i % 3) * 30}%`,
                  "--tx": `${(Math.random() - 0.5) * 100}px`,
                  "--ty": `${(Math.random() - 0.5) * 100}px`,
                  "--duration": `${4 + Math.random() * 4}s`,
                  "--delay": `${i * 0.5}s`,
                } as React.CSSProperties}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
