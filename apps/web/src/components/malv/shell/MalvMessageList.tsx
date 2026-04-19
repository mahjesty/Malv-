import type { LegacyRef, ReactNode, RefObject } from "react";

/**
 * Scroll surface for the operator transcript.
 * Intentionally frameless — transcript content owns its own rhythm.
 */
export function MalvMessageList(props: {
  listRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={["relative flex min-h-0 flex-1 flex-col overflow-hidden", props.className ?? ""].join(" ")}
      style={{ background: "var(--malv-chat-bg)", transition: "background-color 220ms ease" }}
    >
      <div
        ref={props.listRef as LegacyRef<HTMLDivElement>}
        className="relative flex-1 overflow-auto scroll-smooth"
        style={{ padding: "1.5rem 1rem 2rem" }}
      >
        <div
          className="mx-auto w-full"
          style={{ maxWidth: "740px" }}
        >
          <div className="space-y-1">{props.children}</div>
        </div>
      </div>
    </div>
  );
}
