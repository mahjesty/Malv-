import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function Modal(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.open, props.onClose]);

  return (
    <AnimatePresence>
      {props.open ? (
        <motion.div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/75"
            onClick={props.onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="relative w-full max-w-lg rounded-2xl border border-white/[0.14] bg-surface-raised shadow-panel-deep p-5 ring-1 ring-inset ring-white/[0.06]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="font-display text-lg font-semibold tracking-tight">{props.title}</div>
              <button
                type="button"
                onClick={props.onClose}
                className="rounded-lg px-2 py-1 text-malv-text/50 hover:text-malv-text hover:bg-white/[0.05] transition"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 text-sm text-malv-text leading-relaxed">{props.children}</div>
            {props.footer ? <div className="mt-5 flex flex-wrap gap-2 justify-end">{props.footer}</div> : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
