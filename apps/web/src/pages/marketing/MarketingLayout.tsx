import { useEffect, useState, type ReactNode } from "react";
import { LogoMark, Button } from "@malv/ui";
import { NavLink } from "react-router-dom";

export default function MarketingLayout(props: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const hadDark = document.documentElement.classList.contains("dark");
    document.documentElement.classList.add("dark");
    return () => {
      if (!hadDark) document.documentElement.classList.remove("dark");
    };
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const navItemClass =
    "text-sm text-malv-muted transition hover:text-malv-text focus-visible:outline-none focus-visible:text-malv-text";

  return (
    <div className="min-h-screen bg-malv-canvas text-malv-text relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(59,130,246,0.12),transparent_45%),radial-gradient(circle_at_85%_10%,rgba(99,102,241,0.12),transparent_38%),linear-gradient(180deg,rgba(3,6,16,0.88),rgba(4,6,14,0.98))]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.18] bg-[length:56px_56px] bg-malv-grid"
        style={{ maskImage: "radial-gradient(ellipse at 50% 0%, black, transparent 65%)" }}
      />
      <div className="pointer-events-none absolute -top-44 left-1/2 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.2)_0%,rgba(59,130,246,0.1)_38%,rgba(2,6,23,0)_70%)] blur-3xl" />

      <header
        className={[
          "sticky top-0 z-40 border-b transition-all duration-300",
          scrolled
            ? "border-white/[0.16] bg-[rgba(5,8,18,0.88)] backdrop-blur-xl shadow-[0_10px_40px_rgba(2,6,23,0.62)]"
            : "border-white/[0.1] bg-[rgba(4,7,16,0.94)]"
        ].join(" ")}
      >
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
          <NavLink to="/" className="flex items-center gap-3 min-w-0 group">
            <LogoMark size={32} />
            <div className="min-w-0">
              <div className="font-display font-bold tracking-tight group-hover:text-malv-text transition">MALV</div>
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-brand truncate">Private AI operator</div>
            </div>
          </NavLink>
          <nav className="hidden md:flex items-center gap-6">
            <NavLink to="/features" className={navItemClass}>
              Features
            </NavLink>
            <NavLink to="/pricing" className={navItemClass}>
              Pricing
            </NavLink>
            <NavLink to="/support" className={navItemClass}>
              Support
            </NavLink>
            <NavLink to="/help" className={navItemClass}>
              Help
            </NavLink>
          </nav>
          <div className="hidden md:flex items-center gap-2">
            <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => (window.location.href = "/auth/login")}>
              Sign in
            </Button>
            <Button size="sm" className="rounded-xl px-4" onClick={() => (window.location.href = "/auth/signup")}>
              Create account
            </Button>
          </div>
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-label="Toggle menu"
            className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/[0.03] text-malv-text transition hover:bg-white/[0.08] focus-visible:malv-focus-ring"
            onClick={() => setMenuOpen((value) => !value)}
          >
            <span className="sr-only">Open menu</span>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div
          className={[
            "md:hidden overflow-hidden transition-all duration-300",
            menuOpen ? "max-h-80 opacity-100 border-t border-white/[0.1]" : "max-h-0 opacity-0"
          ].join(" ")}
        >
          <div className="px-4 py-4 bg-[rgba(4,7,16,0.97)] backdrop-blur-xl space-y-4">
            <nav className="grid gap-2">
              <NavLink to="/features" className={navItemClass} onClick={() => setMenuOpen(false)}>
                Features
              </NavLink>
              <NavLink to="/pricing" className={navItemClass} onClick={() => setMenuOpen(false)}>
                Pricing
              </NavLink>
              <NavLink to="/support" className={navItemClass} onClick={() => setMenuOpen(false)}>
                Support
              </NavLink>
              <NavLink to="/help" className={navItemClass} onClick={() => setMenuOpen(false)}>
                Help
              </NavLink>
            </nav>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="flex-1"
                onClick={() => {
                  setMenuOpen(false);
                  window.location.href = "/auth/login";
                }}
              >
                Sign in
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={() => {
                  setMenuOpen(false);
                  window.location.href = "/auth/signup";
                }}
              >
                Create account
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="relative">{props.children}</div>

      <footer className="border-t border-white/[0.14] mt-24 bg-[rgba(3,5,12,0.95)]">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            <div className="flex items-center gap-3 max-w-md">
              <LogoMark size={28} />
              <div className="text-sm text-malv-muted leading-relaxed">
                Private-first intelligence. GPU-aware Beast orchestration. Vault isolation.
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-sm text-malv-muted">
              <NavLink to="/privacy" className="hover:text-malv-text transition">
                Privacy
              </NavLink>
              <NavLink to="/terms" className="hover:text-malv-text transition">
                Terms
              </NavLink>
              <NavLink to="/cookies" className="hover:text-malv-text transition">
                Cookies
              </NavLink>
              <NavLink to="/security" className="hover:text-malv-text transition">
                Security
              </NavLink>
            </div>
          </div>
          <div className="mt-8 text-[11px] font-mono text-malv-muted tracking-wide">
            © {new Date().getFullYear()} MALV. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
