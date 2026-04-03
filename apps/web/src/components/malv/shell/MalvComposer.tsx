import { motion } from "framer-motion";
import { Button } from "@malv/ui";
import type { ReactNode } from "react";

export function MalvComposer(props: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  sending?: boolean;
  generationActive?: boolean;
  onStop?: () => void;
  primaryLabel?: string;
  stopLabel?: string;
  footer?: ReactNode;
}) {
  const {
    value,
    onChange,
    onSubmit,
    placeholder = "Describe the task, constraints, and desired outcome…",
    disabled,
    sending,
    generationActive,
    onStop,
    primaryLabel = "Transmit",
    stopLabel = "Stop"
  } = props;

  return (
    <motion.div
      initial={false}
      animate={{
        boxShadow: generationActive
          ? "0 0 0 1px rgba(96,165,250,0.25), 0 18px 50px rgba(0,0,0,0.45)"
          : "0 4px 28px rgba(0,0,0,0.35)"
      }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl border border-white/[0.1] bg-surface-base/50 p-4 backdrop-blur-xl sm:p-5 lg:sticky lg:bottom-4 lg:z-10"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          <label className="mb-2 block text-[11px] font-mono uppercase tracking-[0.18em] text-malv-text/40">Directive</label>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={3}
            className="malv-focus-ring w-full min-h-[5.5rem] max-h-48 resize-none rounded-2xl border border-white/[0.1] bg-surface-void/80 px-4 py-3.5 text-[15px] leading-relaxed text-malv-text placeholder:text-malv-text/35 transition-colors duration-200 focus:outline-none focus:border-brand/35"
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:flex-col xl:flex-row lg:shrink-0">
          {generationActive && onStop ? (
            <Button type="button" variant="danger" onClick={onStop} className="min-h-[48px] w-full justify-center px-8 sm:w-auto">
              {stopLabel}
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={onSubmit}
            disabled={disabled || generationActive || sending || !value.trim()}
            loading={sending}
            className="min-h-[48px] w-full justify-center px-10 shadow-glow sm:w-auto"
          >
            {generationActive ? "Executing…" : sending ? "Handoff…" : primaryLabel}
          </Button>
        </div>
      </div>
      {props.footer}
    </motion.div>
  );
}
