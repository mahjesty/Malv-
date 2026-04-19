import { motion } from "framer-motion";

type Props = { statusLabel?: string };

export function GenerationState({ statusLabel }: Props) {
  const line = (statusLabel ?? "Generating…").trim() || "Generating…";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="max-w-[100%] overflow-hidden rounded-2xl bg-gradient-to-b from-white/[0.05] to-transparent p-3 shadow-[0_12px_36px_rgba(0,0,0,0.28)] ring-1 ring-white/[0.05] sm:p-4"
      role="status"
      aria-live="polite"
    >
      <div className="mb-3 flex items-center gap-2">
        <motion.span
          className="h-1.5 w-1.5 rounded-full bg-malv-f-live shadow-[0_0_10px_rgb(var(--malv-f-live-rgb)/0.45)]"
          animate={{ opacity: [0.45, 1, 0.45], scale: [1, 1.2, 1] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/45">MALV</span>
      </div>
      <p className="mb-3 text-[13px] font-medium leading-snug text-white/[0.88] sm:text-[14px]">{line}</p>
      <div className="relative h-[min(42vw,200px)] min-h-[148px] overflow-hidden rounded-2xl bg-[rgb(var(--malv-surface-void-rgb))] shadow-[inset_0_0_80px_rgb(var(--malv-f-live-rgb)/0.05),inset_0_1px_0_rgb(255_255_255/0.04)] sm:h-[200px] sm:min-h-[200px]">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,rgb(var(--malv-f-live-rgb)/0.09),transparent_65%)]"
          aria-hidden
        />
        <motion.div
          className="pointer-events-none absolute inset-0 opacity-40"
          animate={{ opacity: [0.25, 0.45, 0.25] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
          aria-hidden
        >
          <div className="h-full w-full bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.06),transparent_55%)]" />
        </motion.div>
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent" aria-hidden />
        <motion.div
          className="absolute inset-y-0 left-0 w-[45%] bg-gradient-to-r from-transparent via-white/[0.07] to-transparent blur-sm"
          initial={{ x: "-30%" }}
          animate={{ x: "280%" }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          aria-hidden
        />
      </div>
    </motion.div>
  );
}
