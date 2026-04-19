import { motion } from "framer-motion";
import { Sparkles, Wand2 } from "lucide-react";
import type { ThreadMessage } from "./types";

type Props = {
  message: Extract<ThreadMessage, { role: "assistant" }>;
};

export function ImageMessage({ message }: Props) {
  const interpretation = message.text.trim();

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="max-w-[100%] rounded-2xl bg-gradient-to-b from-white/[0.04] to-transparent p-3 shadow-[0_16px_44px_rgba(0,0,0,0.32)] ring-1 ring-white/[0.05] sm:p-4"
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div className="inline-flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-malv-f-live" aria-hidden />
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/45">MALV</span>
        </div>
      </div>
      {message.imageUrl ? (
        <motion.div
          className="relative mb-4 overflow-hidden rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_28px_56px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.04)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35 }}
        >
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgb(var(--malv-f-live-rgb)/0.08),transparent_70%)]"
            aria-hidden
          />
          <motion.img
            initial={{ opacity: 0, scale: 0.992 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
            src={message.imageUrl}
            alt="Generated result"
            className="relative z-[1] h-auto w-full object-cover"
          />
        </motion.div>
      ) : (
        <div className="relative mb-4 flex min-h-[220px] items-center justify-center overflow-hidden rounded-2xl bg-[rgb(var(--malv-surface-void-rgb))] shadow-[inset_0_0_60px_rgb(var(--malv-f-live-rgb)/0.06),inset_0_1px_0_rgb(255_255_255/0.04)] sm:min-h-[260px]">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(255,255,255,0.05),transparent_60%)]"
            aria-hidden
          />
          <Wand2 className="relative z-[1] h-6 w-6 text-white/35" aria-hidden />
        </div>
      )}
      {interpretation ? (
        <p className="text-[12px] leading-relaxed text-white/60 sm:text-[13px]">{interpretation}</p>
      ) : null}
    </motion.div>
  );
}
