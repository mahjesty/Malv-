import { CinematicBackground } from "@/components/landing/cinematic-background";
import { CTASection } from "@/components/landing/cta-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { BentoSection } from "@/components/landing/bento-section";
import { Footer } from "@/components/landing/footer";
import { HeroSection } from "@/components/landing/hero-section";
import { LogoCloud } from "@/components/landing/logo-cloud";
import { Navbar } from "@/components/landing/navbar";
import { StatsSection } from "@/components/landing/stats-section";
import { TestimonialsSection } from "@/components/landing/testimonials-section";
import { MalvRegion } from "@/lib/studio/malvRegion";

export default function LandingPage() {
  return (
    <div className="landing-v0 dark min-h-screen bg-background text-foreground antialiased overflow-x-hidden">
      <MalvRegion
        as="main"
        region="page"
        id="landing.page.root"
        label="Landing Page"
        type="page"
        className="relative min-h-screen overflow-x-hidden"
      >
        <CinematicBackground />
        <Navbar />
        <HeroSection />
        <LogoCloud />
        <FeaturesSection />
        <BentoSection />
        <StatsSection />
        <TestimonialsSection />
        <CTASection />
        <Footer />
      </MalvRegion>
    </div>
  );
}
