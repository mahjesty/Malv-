import { useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { GenerationState } from "./GenerationState";
import { ImageMessage } from "./ImageMessage";
import { UserMessage } from "./UserMessage";
import type { ThreadMessage } from "./types";

type Props = {
  /** Replaces default max-height / scroll shell (e.g. full session column). */
  className?: string;
  messages: ThreadMessage[];
};

export function MessageThread({ className, messages }: Props) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  return (
    <div
      className={
        className ??
        "malv-explore-thread-surface max-h-[min(48vh,360px)] overflow-y-auto rounded-2xl p-3 min-[400px]:max-h-[min(50vh,400px)] min-[400px]:rounded-3xl min-[400px]:p-4 sm:max-h-[min(60vh,480px)] sm:p-5"
      }
    >
      <AnimatePresence initial={false}>
        <div className="space-y-4 sm:space-y-5">
          {messages.map((message) => {
            if (message.role === "user") {
              return (
                <UserMessage
                  key={message.id}
                  prompt={message.prompt}
                  sourceImageUrl={message.sourceImageUrl}
                  intentLabel={message.intentLabel}
                  intentHint={message.intentHint}
                />
              );
            }
            if (message.role === "generating") {
              return <GenerationState key={message.id} statusLabel={message.statusLabel} />;
            }
            return <ImageMessage key={message.id} message={message} />;
          })}
          <div ref={endRef} />
        </div>
      </AnimatePresence>
    </div>
  );
}
