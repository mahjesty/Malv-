import { Link } from "react-router-dom";
import { Twitter, Github, Linkedin, Youtube } from "lucide-react";
import { getMalvRegionProps } from "@/lib/studio/malvRegion";

const footerLinks = {
  Product: [
    { label: "Features", href: "/features" },
    { label: "Pricing", href: "/pricing" },
    { label: "API Reference", href: "#" },
    { label: "Documentation", href: "#" },
    { label: "Changelog", href: "#" },
  ],
  Company: [
    { label: "About", href: "#" },
    { label: "Blog", href: "#" },
    { label: "Careers", href: "#" },
    { label: "Press", href: "#" },
    { label: "Contact", href: "#" },
  ],
  Resources: [
    { label: "Community", href: "#" },
    { label: "Help Center", href: "#" },
    { label: "Status", href: "#" },
    { label: "Security", href: "#" },
  ],
  Legal: [
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
    { label: "Cookie Policy", href: "/cookies" },
  ],
};

const socialLinks = [
  { icon: Twitter, href: "#", label: "Twitter" },
  { icon: Github, href: "#", label: "GitHub" },
  { icon: Linkedin, href: "#", label: "LinkedIn" },
  { icon: Youtube, href: "#", label: "YouTube" },
]

export function Footer() {
  return (
    <footer
      {...getMalvRegionProps({
        region: "footer",
        id: "landing.footer.primary",
        label: "Footer",
        type: "footer"
      })}
      className="relative border-t border-border/30 bg-background/50 overflow-x-clip"
    >
      <div className="container mx-auto max-w-7xl px-4 sm:px-5 md:px-6 py-10 sm:py-12 md:py-16 lg:py-20">
        {/* Main footer content */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-x-6 gap-y-10 md:gap-12">
          {/* Brand column */}
          <div className="sm:col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-4 md:mb-6">
              <div className="w-8 h-8 bg-gradient-to-br from-accent to-accent/60 rounded-lg flex items-center justify-center">
                <span className="text-background font-bold text-lg">m</span>
              </div>
              <span className="text-xl font-bold tracking-tight">malv</span>
            </Link>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">
              The future of AI intelligence. Build smarter, faster, better.
            </p>
            {/* Social links */}
            <div className="flex items-center gap-3">
              {socialLinks.map((social) => (
                <Link
                  key={social.label}
                  to={social.href}
                  className="w-9 h-9 rounded-lg bg-secondary/50 flex items-center justify-center hover:bg-accent/20 hover:text-accent transition-all"
                  aria-label={social.label}
                >
                  <social.icon className="w-4 h-4" />
                </Link>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="font-semibold mb-3 md:mb-4 text-sm">{category}</h3>
              <ul className="space-y-2 md:space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 md:mt-16 pt-6 md:pt-8 border-t border-border/30 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs sm:text-sm text-muted-foreground text-center md:text-left">
            {new Date().getFullYear()} malv AI, Inc. All rights reserved.
          </p>
          <div className="flex items-center gap-4 md:gap-6 text-xs sm:text-sm text-muted-foreground">
            <Link to="/privacy" className="hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">
              Terms of Service
            </Link>
            <Link to="/cookies" className="hover:text-foreground transition-colors">
              Cookies
            </Link>
          </div>
        </div>
      </div>

      {/* Background accent */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
    </footer>
  )
}
