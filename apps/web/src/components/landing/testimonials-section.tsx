
import { useRef, useEffect, useState } from "react";
import { LANDING_SECTION_IO } from "@/lib/landingObserver";
import { cn } from "@/lib/utils";
import { Quote } from "lucide-react"

const testimonials = [
  {
    quote: "malv has completely transformed how we build AI features. The speed and accuracy are unmatched.",
    author: "Sarah Chen",
    role: "CTO, TechForward",
    avatar: "SC",
  },
  {
    quote: "We reduced our inference costs by 80% while improving response quality. Simply incredible.",
    author: "Marcus Johnson",
    role: "Head of AI, DataFlow",
    avatar: "MJ",
  },
  {
    quote: "The multimodal capabilities opened up use cases we never thought possible. Game changer.",
    author: "Elena Rodriguez",
    role: "VP Engineering, CreativeAI",
    avatar: "ER",
  },
]

export function TestimonialsSection() {
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
    <section ref={sectionRef} className="py-14 sm:py-16 md:py-24 lg:py-32 relative overflow-x-clip overflow-y-visible">
      <div className="container mx-auto px-4 md:px-6 relative z-10">
        {/* Section header */}
        <div className="max-w-3xl mx-auto text-center mb-12 md:mb-20">
          <h2
            className={cn(
              "text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4 md:mb-6 transition-all duration-700 text-balance",
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            Loved by{" "}
            <span className="text-accent">developers</span>
          </h2>
          <p
            className={cn(
              "text-base sm:text-lg text-muted-foreground transition-all duration-700 delay-100 text-pretty",
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            Join thousands of teams building the future with malv.
          </p>
        </div>

        {/* Testimonials grid */}
        <div className="grid md:grid-cols-3 gap-4 md:gap-6 max-w-6xl mx-auto">
          {testimonials.map((testimonial, index) => (
            <div
              key={testimonial.author}
              className={cn(
                "relative p-6 md:p-8 rounded-2xl glass hover:bg-secondary/40 transition-all duration-500 group",
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              )}
              style={{ transitionDelay: `${200 + index * 100}ms` }}
            >
              {/* Quote icon */}
              <Quote className="w-8 h-8 md:w-10 md:h-10 text-accent/30 mb-4" />

              {/* Quote text */}
              <p className="text-sm md:text-base lg:text-lg text-foreground/90 mb-6 md:mb-8 leading-relaxed">
                {'"'}{testimonial.quote}{'"'}
              </p>

              {/* Author */}
              <div className="flex items-center gap-3 md:gap-4">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-br from-accent/30 to-secondary flex items-center justify-center text-sm md:text-base font-semibold">
                  {testimonial.avatar}
                </div>
                <div>
                  <p className="text-sm md:text-base font-semibold">{testimonial.author}</p>
                  <p className="text-xs md:text-sm text-muted-foreground">{testimonial.role}</p>
                </div>
              </div>

              {/* Decorative corner */}
              <div className="absolute top-4 right-4 w-12 h-12 md:w-16 md:h-16 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                <div className="absolute top-0 right-0 w-full h-px bg-gradient-to-l from-accent/50 to-transparent" />
                <div className="absolute top-0 right-0 h-full w-px bg-gradient-to-b from-accent/50 to-transparent" />
              </div>
            </div>
          ))}
        </div>

        {/* Logos or extra social proof */}
        <div
          className={cn(
            "mt-16 md:mt-20 text-center transition-all duration-700 delay-500",
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          )}
        >
          <p className="text-xs sm:text-sm text-muted-foreground mb-4">Backed by world-class investors</p>
          <div className="flex items-center justify-center gap-4 md:gap-8 opacity-50">
            {["a16z", "Sequoia", "Index", "GV"].map((investor) => (
              <span key={investor} className="text-base sm:text-lg md:text-xl font-semibold text-muted-foreground">
                {investor}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
