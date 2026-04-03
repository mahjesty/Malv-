
import { useRef, useEffect, useState } from "react";
import { LANDING_SECTION_IO } from "@/lib/landingObserver";
import { cn } from "@/lib/utils";
import { MessageSquare, Code2, Image, Music, Sparkles, Terminal, Brain, Wand2 } from "lucide-react"

// Typing animation component
function TypingText({ text, delay = 0 }: { text: string; delay?: number }) {
  const [displayText, setDisplayText] = useState("")
  const [isTyping, setIsTyping] = useState(false)

  useEffect(() => {
    const timeout = setTimeout(() => {
      setIsTyping(true)
      let index = 0
      const interval = setInterval(() => {
        if (index < text.length) {
          setDisplayText(text.slice(0, index + 1))
          index++
        } else {
          clearInterval(interval)
        }
      }, 30)
      return () => clearInterval(interval)
    }, delay)
    return () => clearTimeout(timeout)
  }, [text, delay])

  return (
    <span>
      {displayText}
      {isTyping && displayText.length < text.length && (
        <span className="inline-block w-0.5 h-4 bg-accent ml-0.5 animate-pulse" />
      )}
    </span>
  )
}

// Animated code block
function AnimatedCode() {
  const lines = [
    { text: "const", type: "keyword" },
    { text: " malv ", type: "variable" },
    { text: "= ", type: "operator" },
    { text: "await", type: "keyword" },
    { text: " AI", type: "class" },
    { text: ".", type: "operator" },
    { text: "create", type: "method" },
    { text: "()", type: "operator" },
  ]

  return (
    <div className="font-mono text-xs md:text-sm">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <span className="text-accent/60">1</span>
        <span className="text-muted-foreground/60">{"// Initialize malv AI"}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-accent/60">2</span>
        <span>
          {lines.map((token, i) => (
            <span
              key={i}
              className={cn(
                token.type === "keyword" && "text-violet-400",
                token.type === "variable" && "text-foreground",
                token.type === "operator" && "text-muted-foreground",
                token.type === "class" && "text-amber-400",
                token.type === "method" && "text-blue-400"
              )}
            >
              {token.text}
            </span>
          ))}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-accent/60">3</span>
        <span className="text-muted-foreground/60">{"// Ready to use"}</span>
      </div>
    </div>
  )
}

// Audio waveform visualization
function AudioWaveform() {
  return (
    <div className="flex items-end gap-0.5 h-16">
      {[...Array(32)].map((_, i) => {
        const height = 20 + Math.sin(i * 0.4) * 30 + Math.random() * 30
        return (
          <div
            key={i}
            className="flex-1 bg-gradient-to-t from-accent/60 to-accent/20 rounded-full transition-all duration-300"
            style={{
              height: `${height}%`,
              animationDelay: `${i * 50}ms`,
            }}
          />
        )
      })}
    </div>
  )
}

export function BentoSection() {
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
    <section ref={sectionRef} id="capabilities" className="py-16 sm:py-20 md:py-32 relative overflow-x-clip overflow-y-visible">
      <div className="container mx-auto px-4 md:px-6 relative z-10">
        {/* Section header */}
        <div className="max-w-3xl mx-auto text-center mb-16 md:mb-24">
          <div
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 mb-6 glass-ultra rounded-full text-sm transition-all duration-700",
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="text-muted-foreground">Capabilities</span>
          </div>
          <h2
            className={cn(
              "text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6 transition-all duration-700 delay-100 text-balance",
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            One model.{" "}
            <span className="text-gradient-animated">Infinite possibilities.</span>
          </h2>
          <p
            className={cn(
              "text-base sm:text-lg md:text-xl text-muted-foreground transition-all duration-700 delay-200 text-pretty",
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            From creative writing to complex code, malv handles it all with unprecedented capability.
          </p>
        </div>

        {/* Bento grid */}
        <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5 auto-rows-[minmax(180px,auto)]">
          {/* Card 1 - Chat (Large) */}
          <div
            className={cn(
              "md:col-span-2 md:row-span-2 glass-ultra rounded-3xl p-6 md:p-8 relative overflow-hidden group transition-all duration-700 glow-border",
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            )}
            style={{ transitionDelay: "200ms" }}
          >
            {/* Animated gradient background */}
            <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-violet-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            <div className="relative z-10 h-full flex flex-col">
              <div className="flex items-center gap-3 mb-6">
                <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-accent/20 to-violet-500/20 flex items-center justify-center">
                  <MessageSquare className="w-6 h-6 text-accent" />
                  <div className="absolute inset-0 rounded-xl bg-accent/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold">Natural Conversation</h3>
                  <p className="text-sm text-muted-foreground">Human-like dialogue</p>
                </div>
              </div>
              
              <div className="flex-1 space-y-4">
                {/* User message */}
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-secondary flex-shrink-0 flex items-center justify-center text-xs font-medium">U</div>
                  <div className="max-w-[80%] bg-secondary/80 rounded-2xl rounded-tl-sm px-4 py-3 backdrop-blur-sm">
                    <p className="text-sm">How can I optimize my React application for better performance?</p>
                  </div>
                </div>
                
                {/* AI response */}
                <div className="flex gap-3 justify-end">
                  <div className="max-w-[80%] bg-gradient-to-br from-accent/20 to-violet-500/10 rounded-2xl rounded-tr-sm px-4 py-3 backdrop-blur-sm border border-accent/10">
                    <p className="text-sm">
                      <TypingText text="I'll analyze your codebase and provide specific recommendations for optimization..." delay={500} />
                    </p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-violet-500 flex-shrink-0 flex items-center justify-center">
                    <span className="text-xs font-bold text-background">m</span>
                  </div>
                </div>
                
                {/* Thinking indicator */}
                <div className="flex gap-3 justify-end">
                  <div className="glass-ultra rounded-2xl px-4 py-3 border border-accent/20">
                    <div className="flex items-center gap-3">
                      <Brain className="w-4 h-4 text-accent animate-pulse" />
                      <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-2 h-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-2 h-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2 - Code Generation */}
          <div
            className={cn(
              "md:col-span-1 lg:col-span-2 glass-ultra rounded-3xl p-6 relative overflow-hidden group transition-all duration-700 glow-border",
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            )}
            style={{ transitionDelay: "300ms" }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
                  <Code2 className="w-5 h-5 text-blue-400" />
                </div>
                <h3 className="font-semibold">Code Generation</h3>
              </div>
              
              <div className="bg-background/60 rounded-xl p-4 backdrop-blur-sm border border-border/50">
                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border/50">
                  <div className="w-3 h-3 rounded-full bg-red-500/60" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                  <div className="w-3 h-3 rounded-full bg-green-500/60" />
                  <span className="text-xs text-muted-foreground ml-2">main.ts</span>
                </div>
                <AnimatedCode />
              </div>
            </div>
          </div>

          {/* Card 3 - Image Understanding */}
          <div
            className={cn(
              "glass-ultra rounded-3xl p-6 relative overflow-hidden group transition-all duration-700 glow-border",
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            )}
            style={{ transitionDelay: "400ms" }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            <div className="relative z-10 h-full flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
                  <Image className="w-5 h-5 text-emerald-400" />
                </div>
                <h3 className="font-semibold">Vision AI</h3>
              </div>
              
              <div className="flex-1 relative rounded-xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center animate-pulse">
                      <Wand2 className="w-8 h-8 text-emerald-400" />
                    </div>
                    <div className="absolute -inset-4 border-2 border-emerald-400/30 rounded-3xl border-dashed animate-spin" style={{ animationDuration: "10s" }} />
                  </div>
                </div>
                <div className="absolute bottom-2 left-2 right-2 glass-ultra rounded-lg px-3 py-2 text-xs">
                  <span className="text-emerald-400">Detected:</span> Objects, Text, Faces
                </div>
              </div>
            </div>
          </div>

          {/* Card 4 - Audio */}
          <div
            className={cn(
              "glass-ultra rounded-3xl p-6 relative overflow-hidden group transition-all duration-700 glow-border",
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            )}
            style={{ transitionDelay: "500ms" }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 via-transparent to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            <div className="relative z-10 h-full flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500/20 to-pink-500/20 flex items-center justify-center">
                  <Music className="w-5 h-5 text-rose-400" />
                </div>
                <h3 className="font-semibold">Audio</h3>
              </div>
              
              <div className="flex-1 flex items-center">
                <AudioWaveform />
              </div>
              
              <p className="text-xs text-muted-foreground mt-3">Speech, music, and sound analysis</p>
            </div>
          </div>

          {/* Card 5 - Terminal (Wide) */}
          <div
            className={cn(
              "md:col-span-2 glass-ultra rounded-3xl p-6 relative overflow-hidden group transition-all duration-700 glow-border",
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            )}
            style={{ transitionDelay: "600ms" }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                  <Terminal className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-semibold">Developer-First API</h3>
                  <p className="text-xs text-muted-foreground">RESTful & GraphQL</p>
                </div>
              </div>
              
              <div className="bg-background/60 rounded-xl p-4 font-mono text-xs md:text-sm overflow-x-auto backdrop-blur-sm border border-border/50">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="text-emerald-400">$</span>
                  <span>curl -X POST api.malv.ai/v1/chat \</span>
                </div>
                <div className="pl-4 mt-1">
                  <span className="text-muted-foreground">-H </span>
                  <span className="text-amber-400">{'"Authorization: Bearer $API_KEY"'}</span>
                  <span className="text-muted-foreground"> \</span>
                </div>
                <div className="pl-4 mt-1">
                  <span className="text-muted-foreground">-d </span>
                  <span className="text-accent">{`'{"model": "malv-2", "messages": [...]}'`}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 6 - Real-time */}
          <div
            className={cn(
              "md:col-span-1 lg:col-span-2 glass-ultra rounded-3xl p-6 relative overflow-hidden group transition-all duration-700 glow-border",
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            )}
            style={{ transitionDelay: "700ms" }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 via-transparent to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-violet-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Real-time Streaming</h3>
                    <p className="text-xs text-muted-foreground">Sub-50ms responses</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs text-emerald-400">Live</span>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                {["Tokens/sec", "Latency", "Throughput"].map((label, i) => (
                  <div key={label} className="bg-background/40 rounded-xl p-3 backdrop-blur-sm border border-border/30">
                    <div className="text-lg md:text-xl font-bold text-violet-400">
                      {i === 0 ? "10K+" : i === 1 ? "<50ms" : "99.9%"}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
