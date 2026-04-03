import type { ChatAttachmentRef } from "@/lib/chat/types";
import { ChatImageAttachment } from "./ChatImageAttachment";

/**
 * Sent user messages: image-only grid / featured layout from `message.attachments` image runs.
 */
export function ChatImageAttachmentGrid({ images }: { images: ChatAttachmentRef[] }) {
  const n = images.length;

  if (n === 1) {
    return (
      <div className="ml-auto w-fit min-w-0 max-w-[min(100%,70%)]">
        <ChatImageAttachment attachment={images[0]!} layout="featured" />
      </div>
    );
  }

  /** Two images: compact pair, same right edge as text bubble (w-24 mobile / w-28 desktop). */
  if (n === 2) {
    return (
      <div className="ml-auto grid w-fit grid-cols-2 gap-1.5">
        {images.map((a) => (
          <div key={a.id} className="flex min-w-0 justify-center">
            <div className="aspect-square w-24 shrink-0 sm:w-28">
              <ChatImageAttachment attachment={a} layout="grid" gridDensity="compact" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  /** 3–4 images: tight 2-column grid. */
  if (n >= 3 && n <= 4) {
    return (
      <div className="ml-auto grid w-fit grid-cols-2 gap-1.5">
        {images.map((a) => (
          <div key={a.id} className="flex min-w-0 justify-center">
            <div className="aspect-square w-24 shrink-0 sm:w-28">
              <ChatImageAttachment attachment={a} layout="grid" gridDensity="compact" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  /** 5+ images: dense grid — 2 cols mobile, 3 cols sm+. */
  return (
    <div className="ml-auto grid w-fit grid-cols-2 gap-1 sm:grid-cols-3 sm:gap-1.5">
      {images.map((a) => (
        <div key={a.id} className="flex min-w-0 justify-center">
          <div className="aspect-square w-24 shrink-0 sm:w-28">
            <ChatImageAttachment attachment={a} layout="grid" gridDensity="dense" />
          </div>
        </div>
      ))}
    </div>
  );
}
