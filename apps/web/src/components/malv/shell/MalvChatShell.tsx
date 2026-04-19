import { motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Operator chat layout — clean grid shell, no chrome.
 * Structure: [optional conversations list] | main transcript | [optional rail]
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
    ? "grid gap-3 lg:gap-4 lg:grid-cols-[220px_minmax(0,1fr)]"
    : "grid";

  return (
    <div className={["flex min-h-0 flex-col", props.className ?? ""].join(" ")}>
      <div className={`min-h-0 flex-1 ${gridClass}`}>
        {props.conversations ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="hidden min-h-0 min-w-0 lg:flex lg:flex-col"
          >
            <div className="flex min-h-[52dvh] flex-1 flex-col sm:min-h-[56vh] lg:min-h-[min(64vh,720px)]">
              {props.conversations}
            </div>
          </motion.div>
        ) : null}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="flex min-h-0 min-w-0 flex-col"
        >
          <div className="flex min-h-[52dvh] flex-1 flex-col sm:min-h-[56vh] lg:min-h-[min(64vh,720px)]">
            {props.main}
          </div>
        </motion.div>
      </div>

      {props.alerts ? <div className="mt-2">{props.alerts}</div> : null}
      {props.composer ? <div className="mt-3">{props.composer}</div> : null}
    </div>
  );
}
