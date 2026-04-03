import type { ChatAttachmentRef } from "@/lib/chat/types";
import { ChatFileAttachment } from "./ChatFileAttachment";
import { ChatImageAttachmentGrid } from "./ChatImageAttachmentGrid";

function groupByConsecutiveKind(attachments: ChatAttachmentRef[]) {
  type Block =
    | { kind: "images"; items: ChatAttachmentRef[] }
    | { kind: "files"; items: ChatAttachmentRef[] };
  const blocks: Block[] = [];

  for (const a of attachments) {
    const isImage = a.kind === "image";
    const last = blocks[blocks.length - 1];
    if (isImage && last?.kind === "images") {
      last.items.push(a);
    } else if (!isImage && last?.kind === "files") {
      last.items.push(a);
    } else if (isImage) {
      blocks.push({ kind: "images", items: [a] });
    } else {
      blocks.push({ kind: "files", items: [a] });
    }
  }
  return blocks;
}

/** Renders `message.attachments` for sent user rows; parent `UserMessageGroup` supplies alignment. */
export function UserMessageAttachments({ attachments }: { attachments: ChatAttachmentRef[] }) {
  if (!attachments.length) return null;

  const onlyImages = attachments.every((a) => a.kind === "image");

  if (onlyImages) {
    return (
      <div className="flex w-fit flex-col items-end gap-1.5">
        <ChatImageAttachmentGrid images={attachments} />
      </div>
    );
  }

  const blocks = groupByConsecutiveKind(attachments);

  return (
    <div className="flex w-fit flex-col items-end gap-1.5">
      {blocks.map((block, blockIdx) =>
        block.kind === "images" ? (
          <ChatImageAttachmentGrid key={`img-${blockIdx}-${block.items[0]?.id ?? blockIdx}`} images={block.items} />
        ) : (
          block.items.map((a) => (
            <div key={a.id} className="flex w-fit justify-end">
              <ChatFileAttachment attachment={a} />
            </div>
          ))
        )
      )}
    </div>
  );
}
