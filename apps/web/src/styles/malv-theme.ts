export const malvTheme = {
  radius: {
    sm: "rounded-xl",
    md: "rounded-2xl",
    lg: "rounded-3xl",
    full: "rounded-full"
  },
  surfaces: {
    screen:
      "bg-[radial-gradient(120%_80%_at_20%_-10%,rgba(99,102,241,0.18),transparent_46%),radial-gradient(130%_90%_at_100%_0%,rgba(16,185,129,0.16),transparent_48%),radial-gradient(120%_120%_at_50%_120%,rgba(6,182,212,0.14),transparent_60%),linear-gradient(180deg,#070b16_0%,#090f1f_45%,#080b16_100%)] dark:[background:radial-gradient(120%_80%_at_20%_-10%,rgba(99,102,241,0.18),transparent_46%),radial-gradient(130%_90%_at_100%_0%,rgba(16,185,129,0.16),transparent_48%),radial-gradient(120%_120%_at_50%_120%,rgba(6,182,212,0.14),transparent_60%),linear-gradient(180deg,#070b16_0%,#090f1f_45%,#080b16_100%)]",
    glass:
      "border border-white/12 bg-white/[0.045] backdrop-blur-2xl shadow-[0_20px_64px_rgba(1,4,16,0.45)] dark:border-white/10 dark:bg-white/[0.03]",
    glassStrong:
      "border border-white/14 bg-white/[0.07] backdrop-blur-3xl shadow-[0_24px_80px_rgba(3,8,24,0.55)] dark:border-white/12 dark:bg-white/[0.05]",
    overlay:
      "bg-black/28 dark:bg-black/36 backdrop-blur-xl border border-white/10"
  },
  text: {
    title: "text-slate-950 dark:text-slate-100",
    body: "text-slate-700 dark:text-slate-300",
    muted: "text-slate-600/80 dark:text-slate-400/85",
    accent: "text-cyan-600 dark:text-cyan-300"
  },
  glow: {
    cyan: "shadow-[0_0_42px_rgba(34,211,238,0.35)]",
    violet: "shadow-[0_0_44px_rgba(167,139,250,0.34)]",
    emerald: "shadow-[0_0_40px_rgba(52,211,153,0.33)]",
    ring: "ring-1 ring-white/10 ring-offset-0"
  }
} as const;

export type MalvTheme = typeof malvTheme;
