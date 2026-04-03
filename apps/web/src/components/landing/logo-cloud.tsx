
import { useRef, useEffect, useState } from "react";
import { LANDING_SECTION_IO } from "@/lib/landingObserver";
import { cn } from "@/lib/utils";

const logos = [
  { name: "Vercel", letter: "V" },
  { name: "Stripe", letter: "S" },
  { name: "Linear", letter: "L" },
  { name: "Notion", letter: "N" },
  { name: "Figma", letter: "F" },
  { name: "Slack", letter: "S" },
  { name: "Discord", letter: "D" },
  { name: "GitHub", letter: "G" },
]

export function LogoCloud() {
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
    <section ref={sectionRef} className="py-10 sm:py-12 md:py-20 border-y border-border/30 overflow-x-clip">
      <div className="container mx-auto px-4 md:px-6">
        <p className="text-center text-xs sm:text-sm text-muted-foreground mb-8 md:mb-12">
          Powering the next generation of AI-native companies
        </p>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-4 md:gap-8">
          {logos.map((logo, index) => (
            <div
              key={logo.name}
              className={cn(
                "flex flex-col items-center justify-center group transition-all duration-500",
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              )}
              style={{ transitionDelay: `${index * 50}ms` }}
            >
              <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-xl bg-secondary/50 flex items-center justify-center group-hover:bg-accent/10 group-hover:scale-110 transition-all duration-300">
                <span className="text-lg sm:text-xl md:text-2xl font-bold text-muted-foreground group-hover:text-accent transition-colors">
                  {logo.letter}
                </span>
              </div>
              <span className="mt-2 text-[10px] sm:text-xs text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
                {logo.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
