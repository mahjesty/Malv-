import { motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Premium operator chat layout — containers pass real data; this is structure + atmosphere.
 */
export function MalvChatShell(props: {
  main: ReactNode;
  rail?: ReactNode;
  conversations?: ReactNode;
  composer?: ReactNode;
  alerts?: ReactNode;
  className?: string;
}) {
  const gridClass = props.conversations
    ? "grid gap-4 lg:gap-6 lg:grid-cols-[240px_minmax(0,1fr)_288px]"
    : "grid gap-4 lg:gap-6 lg:grid-cols-[minmax(0,1fr)_288px]";

  return (
    <div className={["flex min-h-0 flex-col gap-4 lg:gap-6", props.className ?? ""].join(" ")}>
      <div className={`min-h-0 ${gridClass}`}>
        {props.conversations ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="hidden min-h-0 min-w-0 lg:flex lg:flex-col"
          >
            <div className="flex min-h-[52dvh] flex-1 flex-col sm:min-h-[56vh] lg:min-h-[min(64vh,720px)]">{props.conversations}</div>
          </motion.div>
        ) : null}

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="flex min-h-0 min-w-0 flex-col"
        >
          <div className="flex min-h-[52dvh] flex-1 flex-col sm:min-h-[56vh] lg:min-h-[min(64vh,720px)]">{props.main}</div>
        </motion.div>

        {props.rail ? (
          <aside className="flex min-w-0 flex-col gap-3">
            <div className="hidden min-h-0 lg:flex lg:flex-col lg:gap-3">{props.rail}</div>
          </aside>
        ) : null}
      </div>

      {props.alerts}
      {props.composer}
    </div>
  );
}
