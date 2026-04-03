import { motion } from "framer-motion";
import { MALVPresence } from "../presence";
import type { PresenceState, PresenceVariant } from "../presence/types";

/**
 * Focused presence mount — wraps uploaded `MALVPresence` with optional caption.
 * Pure presentation; session/socket state is owned by the page/container.
 */
export function MalvPresenceSurface(props: {
  variant?: PresenceVariant;
  state: PresenceState;
  audioLevel?: number;
  caption?: string;
  className?: string;
  presenceClassName?: string;
}) {
  const { variant = "pulse", state, audioLevel = 0, caption, className, presenceClassName } = props;

  return (
    <div className={["relative flex flex-col items-center justify-center", className ?? ""].join(" ")}>
      {caption ? (
        <motion.div
          key={caption}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 px-3 py-1 rounded-full text-xs font-medium border border-white/[0.12] bg-black/30 text-malv-text/80 backdrop-blur-md"
        >
          {caption}
        </motion.div>
      ) : null}
      <MALVPresence variant={variant} state={state} audioLevel={audioLevel} className={presenceClassName ?? "w-36 h-36 md:w-44 md:h-44"} />
    </div>
  );
}
