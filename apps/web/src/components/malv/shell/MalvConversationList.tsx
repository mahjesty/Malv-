import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Skeleton } from "@malv/ui";
import type { ReactNode } from "react";

export type MalvConversationRow = {
  id: string;
  title: string;
  meta?: string;
  active?: boolean;
};

/**
 * Premium conversation rail — data comes from API; this component is presentational.
 */
export function MalvConversationList(props: {
  items: MalvConversationRow[];
  loading?: boolean;
  emptyHint?: ReactNode;
  title?: string;
  toHref?: (id: string) => string;
  className?: string;
}) {
  const {
    items,
    loading,
    emptyHint,
    title = "Recent",
    toHref = (id) => `/app/chat?conversationId=${encodeURIComponent(id)}`,
    className
  } = props;

  return (
    <div
      className={[
        "flex flex-col rounded-2xl border border-white/[0.08] bg-black/20 shadow-panel backdrop-blur-md min-h-0",
        className ?? ""
      ].join(" ")}
    >
      <div className="shrink-0 border-b border-white/[0.06] px-4 py-3">
        <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-malv-text/45">{title}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="space-y-2 p-2">
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        ) : items.length === 0 ? (
          <div className="p-4 text-sm text-malv-text/55">{emptyHint ?? "No sessions yet."}</div>
        ) : (
          <div className="space-y-1">
            {items.map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.25) }}>
                <Link
                  to={toHref(c.id)}
                  className={[
                    "block rounded-xl px-3 py-2.5 transition-colors",
                    c.active
                      ? "bg-white/[0.08] ring-1 ring-inset ring-brand/35 text-malv-text"
                      : "text-malv-text/75 hover:bg-white/[0.05] hover:text-malv-text"
                  ].join(" ")}
                >
                  <div className="truncate text-sm font-semibold">{c.title}</div>
                  {c.meta ? <div className="mt-0.5 truncate text-[11px] text-malv-text/45">{c.meta}</div> : null}
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
