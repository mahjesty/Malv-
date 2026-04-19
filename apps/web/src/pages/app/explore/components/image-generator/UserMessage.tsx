import { motion } from "framer-motion";

type Props = {
  prompt: string;
  sourceImageUrl?: string;
  intentLabel?: string;
  intentHint?: string;
};

export function UserMessage({ prompt, sourceImageUrl, intentLabel, intentHint }: Props) {
  const text = prompt.trim();
  const hasImage = Boolean(sourceImageUrl);
  const label = (intentLabel ?? "").trim();
  const hint = (intentHint ?? "").trim();
  const showIntentChip = Boolean(label && hasImage);
  const duplicateBody =
    showIntentChip && text.toLowerCase() === label.toLowerCase();
  const showBodyText = Boolean(text) && !duplicateBody;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="ml-auto max-w-[min(92%,28rem)] rounded-2xl bg-gradient-to-br from-malv-f-live/16 via-[rgb(var(--malv-surface-overlay-rgb)/0.92)] to-[rgb(var(--malv-surface-void-rgb)/0.96)] px-3.5 py-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.28)] ring-1 ring-[color:var(--malv-color-border-subtle)] min-[400px]:max-w-[min(88%,26rem)] sm:px-4 sm:py-3"
    >
      <span className="mb-2 block text-[9px] font-medium uppercase tracking-[0.2em] text-white/40">You</span>
      {hasImage ? (
        <div className="overflow-hidden rounded-xl ring-1 ring-white/[0.08]">
          <img
            src={sourceImageUrl}
            alt="Your upload"
            className="max-h-[min(52vh,320px)] w-full object-cover object-center"
          />
        </div>
      ) : null}
      {showIntentChip ? (
        <div className="mt-3 flex flex-col items-start gap-1.5">
          <div className="flex items-center gap-2">
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
              {label} style
            </div>
          </div>
          {hint ? <p className="max-w-full text-[11px] leading-snug text-white/40">{hint}</p> : null}
        </div>
      ) : null}
      {showBodyText ? (
        <p
          className={
            showIntentChip
              ? "mt-2 text-[13px] leading-relaxed text-white/[0.92] sm:text-[13.5px]"
              : "text-[13px] leading-relaxed text-white/[0.92] sm:text-[13.5px]"
          }
        >
          {text}
        </p>
      ) : null}
    </motion.div>
  );
}
