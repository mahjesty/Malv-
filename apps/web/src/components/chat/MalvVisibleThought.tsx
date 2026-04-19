import { AnimatePresence, motion } from "framer-motion";

interface MalvVisibleThoughtProps {
  /** Whether to render the thought card at all. */
  visible: boolean;
  /** The humanized thought lines sent by the server. Max 4. */
  lines: string[];
}

/**
 * Visible thought card — ephemeral pre-response reasoning display.
 *
 * Shown only for complex/open-ended turns where approach framing adds value.
 * Disappears the moment the first response chunk arrives.
 *
 * Design: calm, premium, minimal. No spinners, no debug language, no internal mechanics.
 * This is a user-facing UX signal, not an observability panel.
 */
export function MalvVisibleThought({ visible, lines }: MalvVisibleThoughtProps) {
  return (
    <AnimatePresence mode="wait">
      {visible && lines.length > 0 ? (
        <motion.div
          key="malv-visible-thought"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3, transition: { duration: 0.12, ease: "easeIn" } }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="mb-1 rounded-2xl border border-white/[0.08] bg-white/[0.028] px-4 py-3"
        >
          <div className="space-y-[5px]">
            {lines.slice(0, 4).map((line, idx) => (
              <motion.p
                key={`${idx}-${line}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: idx * 0.06, ease: "easeOut" }}
                className="text-[12.5px] leading-relaxed tracking-[-0.005em]"
                style={{ color: "rgb(var(--malv-text-rgb) / 0.62)" }}
              >
                {line}
              </motion.p>
            ))}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
