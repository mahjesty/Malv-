
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Menu, X, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getMalvRegionProps } from "@/lib/studio/malvRegion";

const navLinks = [
  { href: "#features", label: "Features" },
  { href: "#capabilities", label: "Capabilities" },
  { href: "#pricing", label: "Pricing" },
  { href: "/help", label: "Help" },
];

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [activeSection, setActiveSection] = useState("")

  useEffect(() => {
    if (isMobileMenuOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isMobileMenuOpen]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
      
      // Update active section based on scroll position
      const sections = navLinks
        .filter((link) => link.href.startsWith("#"))
        .map((link) => link.href.replace("#", ""));
      for (const section of sections.reverse()) {
        const element = document.getElementById(section)
        if (element) {
          const rect = element.getBoundingClientRect()
          if (rect.top <= 100) {
            setActiveSection(section)
            break
          }
        }
      }
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const closeMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(false)
  }, [])

  return (
    <header
      {...getMalvRegionProps({
        region: "nav",
        id: "landing.navbar.main",
        label: "Navbar",
        type: "navigation"
      })}
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-500 pt-[max(0.5rem,env(safe-area-inset-top))]",
        isScrolled ? "glass-ultra py-3" : "py-4 md:py-5 bg-transparent"
      )}
    >
      {/* Animated top border */}
      <div className={cn(
        "absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent transition-opacity duration-500",
        isScrolled ? "opacity-100" : "opacity-0"
      )} />

      <nav className="container mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="relative w-10 h-10 flex items-center justify-center">
              {/* Glow effect */}
              <div className="absolute inset-0 bg-accent/30 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-all duration-300" />
              {/* Logo background */}
              <div className="relative w-9 h-9 bg-gradient-to-br from-accent via-accent/80 to-accent/60 rounded-xl flex items-center justify-center shadow-lg shadow-accent/20 group-hover:shadow-accent/40 transition-all duration-300 group-hover:scale-105">
                <span className="text-background font-bold text-lg">m</span>
              </div>
              {/* Animated ring */}
              <div className="absolute inset-0 rounded-xl border border-accent/30 scale-100 group-hover:scale-110 opacity-0 group-hover:opacity-100 transition-all duration-300" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold tracking-tight leading-none">malv</span>
              <span className="text-[10px] text-accent/80 tracking-wider">AI PLATFORM</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center">
            <div className="flex items-center gap-1 p-1 glass-ultra rounded-full">
              {navLinks.map((link) => {
                const sectionId = link.href.startsWith("#") ? link.href.replace("#", "") : "";
                const isActive = sectionId !== "" && activeSection === sectionId;
                return (
                  <Link
                    key={link.href}
                    to={link.href}
                    className={cn(
                      "relative px-4 py-2 text-sm rounded-full transition-all duration-300",
                      isActive 
                        ? "text-background" 
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {/* Active background */}
                    {isActive && (
                      <div className="absolute inset-0 bg-foreground rounded-full" />
                    )}
                    <span className="relative z-10">{link.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Button variant="ghost" className="text-sm hover:bg-accent/10 hover:text-accent" asChild>
              <Link to="/auth/login">Log in</Link>
            </Button>
            <Button className="bg-foreground text-background hover:bg-foreground/90 text-sm group relative overflow-hidden glow-border" asChild>
              <Link to="/auth/signup">
                <div className="relative flex w-full items-center justify-center">
                  <span className="relative z-10 flex items-center">
                    Get Started
                    <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-accent/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>
            </Button>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            type="button"
            className="md:hidden relative min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2.5 glass-ultra rounded-xl transition-all duration-300 hover:bg-accent/10 touch-manipulation"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-expanded={isMobileMenuOpen}
            aria-label="Toggle menu"
          >
            <div className="relative w-5 h-5">
              <Menu className={cn(
                "absolute inset-0 w-5 h-5 transition-all duration-300",
                isMobileMenuOpen ? "opacity-0 rotate-90 scale-50" : "opacity-100 rotate-0 scale-100"
              )} />
              <X className={cn(
                "absolute inset-0 w-5 h-5 transition-all duration-300",
                isMobileMenuOpen ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-50"
              )} />
            </div>
          </button>
        </div>

        {/* Mobile Menu */}
        <div
          className={cn(
            "md:hidden overflow-hidden transition-[max-height,opacity] duration-500 ease-out",
            isMobileMenuOpen ? "max-h-[min(85vh,560px)] opacity-100 mt-4" : "max-h-0 opacity-0"
          )}
        >
          <div className="glass-ultra rounded-2xl p-4 space-y-1 border border-accent/10 max-h-[min(80vh,520px)] overflow-y-auto overscroll-contain">
            {/* Promo banner */}
            <div className="flex items-center gap-2 px-4 py-2 bg-accent/10 rounded-xl mb-3">
              <Sparkles className="w-4 h-4 text-accent" />
              <span className="text-xs text-accent">malv 2.0 is here - Try it free</span>
            </div>
            
            {navLinks.map((link, index) => (
              <Link
                key={link.href}
                to={link.href}
                className={cn(
                  "flex items-center justify-between px-4 py-3 text-sm rounded-xl transition-all duration-300",
                  "text-muted-foreground hover:text-foreground hover:bg-accent/5",
                  "transform translate-x-0 opacity-100"
                )}
                style={{ transitionDelay: `${index * 50}ms` }}
                onClick={closeMobileMenu}
              >
                <span>{link.label}</span>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </Link>
            ))}
            
            <div className="pt-3 mt-3 border-t border-border/50 space-y-2">
              <Button variant="ghost" className="w-full justify-center text-sm hover:bg-accent/10" asChild>
                <Link to="/auth/login" onClick={closeMobileMenu}>
                  Log in
                </Link>
              </Button>
              <Button className="w-full bg-foreground text-background hover:bg-foreground/90 text-sm" asChild>
                <Link to="/auth/signup" onClick={closeMobileMenu}>
                  <span className="inline-flex items-center justify-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Get Started Free
                  </span>
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </nav>
    </header>
  )
}
