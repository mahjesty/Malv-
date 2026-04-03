
import { useRef, useEffect, useState } from "react";
import { LANDING_NUMBER_IO, LANDING_SECTION_IO } from "@/lib/landingObserver";
import { cn } from "@/lib/utils";

const stats = [
  { value: "10B+", label: "API Calls Daily", suffix: "" },
  { value: "99.99", label: "Uptime SLA", suffix: "%" },
  { value: "50K+", label: "Active Developers", suffix: "" },
  { value: "<50", label: "Avg Latency", suffix: "ms" },
]

function AnimatedNumber({ value, suffix }: { value: string; suffix: string }) {
  const [displayValue, setDisplayValue] = useState("0")
  const [hasAnimated, setHasAnimated] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true)
          // Simple animation
          const numericPart = value.replace(/[^0-9.]/g, "")
          const numValue = parseFloat(numericPart)
          const prefix = value.replace(/[0-9.]/g, "").replace(/[+%]/g, "")
          const hasPlusSuffix = value.includes("+")
          
          let start = 0
          const duration = 2000
          const startTime = performance.now()

          const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime
            const progress = Math.min(elapsed / duration, 1)
            const easeOut = 1 - Math.pow(1 - progress, 3)
            const current = start + (numValue - start) * easeOut

            if (numValue >= 100) {
              setDisplayValue(prefix + Math.floor(current).toLocaleString() + (hasPlusSuffix ? "+" : ""))
            } else {
              setDisplayValue(prefix + current.toFixed(2) + (hasPlusSuffix ? "+" : ""))
            }

            if (progress < 1) {
              requestAnimationFrame(animate)
            } else {
              setDisplayValue(value)
            }
          }

          requestAnimationFrame(animate)
        }
      },
      LANDING_NUMBER_IO
    );

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => observer.disconnect()
  }, [value, hasAnimated])

  return (
    <span ref={ref} className="tabular-nums">
      {displayValue}
      {suffix}
    </span>
  )
}

export function StatsSection() {
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
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="py-14 sm:py-16 md:py-24 lg:py-32 relative overflow-x-clip overflow-y-visible">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-accent/5 to-transparent pointer-events-none" />
      
      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="max-w-5xl mx-auto">
          {/* Stats grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
            {stats.map((stat, index) => (
              <div
                key={stat.label}
                className={cn(
                  "text-center p-6 md:p-8 rounded-2xl glass transition-all duration-700 hover:bg-secondary/40",
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                )}
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                <div className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-2">
                  <AnimatedNumber value={stat.value} suffix={stat.suffix} />
                </div>
                <p className="text-xs sm:text-sm md:text-base text-muted-foreground">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>

          {/* Decorative line */}
          <div className="relative mt-16 md:mt-24">
            <div className="absolute left-1/2 -translate-x-1/2 w-px h-20 bg-gradient-to-b from-accent/50 to-transparent" />
          </div>
        </div>
      </div>
    </section>
  )
}
