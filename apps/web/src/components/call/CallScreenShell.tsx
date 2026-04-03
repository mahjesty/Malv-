import { type PropsWithChildren } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { malvTheme } from "@/styles/malv-theme";

type CallScreenShellProps = PropsWithChildren<{
  className?: string;
}>;

export function CallScreenShell({ children, className }: CallScreenShellProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative min-h-dvh w-full overflow-hidden px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(0.875rem,env(safe-area-inset-top))] sm:px-5 sm:pb-7 sm:pt-5",
        malvTheme.surfaces.screen,
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <motion.div
          className="absolute -left-14 top-8 h-56 w-56 rounded-full bg-cyan-400/20 blur-[86px] md:h-72 md:w-72"
          animate={{ x: [0, 18, -8, 0], y: [0, -12, 10, 0], opacity: [0.45, 0.75, 0.56, 0.45] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -right-16 top-1/3 h-60 w-60 rounded-full bg-violet-400/20 blur-[96px] md:h-80 md:w-80"
          animate={{ x: [0, -16, 8, 0], y: [0, 12, -8, 0], opacity: [0.34, 0.62, 0.42, 0.34] }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
        />
        <motion.div
          className="absolute bottom-[-5rem] left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-emerald-400/15 blur-[92px] md:h-[22rem] md:w-[22rem]"
          animate={{ scale: [1, 1.08, 1], opacity: [0.3, 0.55, 0.3] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
        />
      </div>

      <div className="pointer-events-none absolute inset-0 opacity-[0.17]" aria-hidden>
        <div className="h-full w-full bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:36px_36px]" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col justify-between gap-3 sm:min-h-[calc(100dvh-3rem)] sm:gap-4">
        {children}
      </div>
    </motion.section>
  );
}
