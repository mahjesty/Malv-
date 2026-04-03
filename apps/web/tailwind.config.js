import forms from "@tailwindcss/forms";
import defaultTheme from "tailwindcss/defaultTheme";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../packages/ui/src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", ...defaultTheme.fontFamily.sans],
        display: ["var(--font-display)", ...defaultTheme.fontFamily.sans],
        mono: ["var(--font-mono)", ...defaultTheme.fontFamily.mono]
      },
      fontSize: {
        "display-xl": ["2.25rem", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        "display-lg": ["1.65rem", { lineHeight: "1.15", letterSpacing: "-0.02em" }]
      },
      colors: {
        /* v0 / landing + auth shells (set on .landing-v0, .malv-dashboard-v0, etc.) */
        background: "var(--v0-background)",
        foreground: "var(--v0-foreground)",
        card: "var(--v0-card)",
        "card-foreground": "var(--v0-card-foreground)",
        popover: "var(--v0-popover)",
        "popover-foreground": "var(--v0-popover-foreground)",
        primary: "var(--v0-primary)",
        "primary-foreground": "var(--v0-primary-foreground)",
        secondary: "var(--v0-secondary)",
        "secondary-foreground": "var(--v0-secondary-foreground)",
        muted: "var(--v0-muted)",
        "muted-foreground": "var(--v0-muted-foreground)",
        accent: "var(--v0-accent)",
        "accent-foreground": "var(--v0-accent-foreground)",
        destructive: "var(--v0-destructive)",
        "destructive-foreground": "var(--v0-destructive-foreground)",
        border: "var(--v0-border)",
        input: "var(--v0-input)",
        ring: "var(--v0-ring)",

        brand: "rgb(var(--malv-brand-rgb) / <alpha-value>)",
        "accent-cyan": "rgb(var(--malv-accent-cyan-rgb) / <alpha-value>)",
        "accent-violet": "rgb(var(--malv-accent-violet-rgb) / <alpha-value>)",

        malv: {
          text: "rgb(var(--malv-text-rgb) / <alpha-value>)",
          muted: "rgb(var(--malv-muted-rgb) / <alpha-value>)",
          canvas: "rgb(var(--malv-canvas-rgb) / <alpha-value>)",
          border: "rgb(var(--malv-border-rgb) / <alpha-value>)"
        },

        surface: {
          void: "rgb(var(--malv-surface-void-rgb) / <alpha-value>)",
          base: "rgb(var(--malv-surface-base-rgb) / <alpha-value>)",
          raised: "rgb(var(--malv-surface-raised-rgb) / <alpha-value>)",
          overlay: "rgb(var(--malv-surface-overlay-rgb) / <alpha-value>)"
        }
      },
      backgroundImage: {
        "malv-grid": `linear-gradient(rgba(255,255,255,0.042) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.042) 1px, transparent 1px)`,
        "malv-radial": `radial-gradient(ellipse 120% 80% at 50% -28%, rgb(96 165 250 / 0.1), transparent 55%), radial-gradient(ellipse 90% 70% at 100% 0%, rgb(167 139 250 / 0.08), transparent 50%)`
      },
      boxShadow: {
        panel: "0 18px 48px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.05)",
        "panel-deep": "0 24px 64px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.06)",
        glow: "0 0 44px rgba(96, 165, 250, 0.24)",
        "glow-sm": "0 0 28px rgba(96, 165, 250, 0.18)",
        lift: "0 14px 36px rgba(0,0,0,0.22), 0 0 0 1px rgba(255,255,255,0.06)"
      },
      keyframes: {
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" }
        }
      },
      animation: {
        "pulse-soft": "pulse-soft 1.75s ease-in-out infinite"
      }
    }
  },
  plugins: [forms]
};
