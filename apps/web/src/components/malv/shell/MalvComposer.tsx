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
          ? "0 0 0 1px rgba(255,255,255,0.12), 0 14px 40px rgba(0,0,0,0.4)"
          : "0 4px 24px rgba(0,0,0,0.32)"
      }}
      transition={{ duration: 0.35 }}
      className="relative rounded-xl border border-[color:var(--malv-color-border-strong)] bg-card/95 p-3 shadow-[0_8px_36px_rgba(0,0,0,0.38),0_0_0_1px_rgb(var(--malv-border-rgb)/0.06)_inset] backdrop-blur-xl sm:p-4 lg:sticky lg:bottom-4 lg:z-10"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          <label className="mb-2 block text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Directive</label>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={3}
            className="w-full min-h-[5.25rem] max-h-44 resize-none rounded-lg border border-[color:var(--malv-color-border-strong)] bg-[rgb(var(--malv-f-surface-rgb)/0.85)] px-4 py-3.5 text-[15px] leading-relaxed text-malv-text caret-[rgb(var(--malv-f-live-rgb))] shadow-[inset_0_1px_2px_rgb(0_0_0/0.14)] transition-[color,background-color,border-color,box-shadow] duration-200 placeholder:text-[color:var(--malv-color-text-placeholder)] focus:outline-none focus-visible:border-malv-f-ring-live/45 focus-visible:shadow-[inset_0_1px_2px_rgb(0_0_0/0.12),0_0_0_1px_rgb(var(--malv-f-ring-live-rgb)/0.28),0_0_32px_rgb(var(--malv-f-live-rgb)/0.14)]"
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
            className="min-h-[44px] w-full justify-center px-8 sm:w-auto"
          >
            {generationActive ? "Executing…" : sending ? "Handoff…" : primaryLabel}
          </Button>
        </div>
      </div>
      {props.footer}
    </motion.div>
  );
}
