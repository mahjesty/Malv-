import { motion, type HTMLMotionProps } from "framer-motion";

type UserMessageGroupProps = {
  children: React.ReactNode;
} & Omit<HTMLMotionProps<"div">, "children">;

/**
 * Right-aligned vertical stack for one sent user turn: attachments → text → status → actions.
 * Keeps a single visual owner so media + caption read as one message.
 */
export function UserMessageGroup({ children, className, ...motionProps }: UserMessageGroupProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={[
        "ml-auto inline-flex max-w-[min(100%,70%)] flex-col items-end gap-2 text-right",
        className ?? ""
      ]
        .filter(Boolean)
        .join(" ")}
      {...motionProps}
    >
      {children}
    </motion.div>
  );
}
