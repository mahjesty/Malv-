import { motion } from "framer-motion";
import { FileText, Film, Link2, Mic } from "lucide-react";
import type { ChatAttachmentRef } from "@/lib/chat/types";
import { formatFileSize } from "@/lib/chat/chatAttachmentUtils";

function KindIcon({ kind }: { kind: ChatAttachmentRef["kind"] }) {
  const cls = "h-5 w-5 text-[oklch(0.78_0.12_210)]";
  switch (kind) {
    case "voice":
      return <Mic className={cls} strokeWidth={2} aria-hidden />;
    case "video_session":
      return <Film className={cls} strokeWidth={2} aria-hidden />;
    case "link":
      return <Link2 className={cls} strokeWidth={2} aria-hidden />;
    default:
      return <FileText className={cls} strokeWidth={2} aria-hidden />;
  }
}

export function ChatFileAttachment({ attachment }: { attachment: ChatAttachmentRef }) {
  const label = attachment.label ?? "Attachment";
  const mime = typeof attachment.metadata?.mimeType === "string" ? attachment.metadata.mimeType : undefined;
  const sizeBytes = attachment.metadata?.sizeBytes;
  const sizeStr =
    typeof sizeBytes === "number" && Number.isFinite(sizeBytes) ? formatFileSize(sizeBytes) : undefined;
  const meta = [attachment.kind, mime, sizeStr].filter(Boolean).join(" · ");

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="flex max-w-[min(100%,380px)] items-center gap-3 rounded-[18px] border border-white/[0.09] px-3.5 py-3 text-left"
      style={{
        background:
          "linear-gradient(155deg, oklch(0.13 0.03 260 / 0.92), oklch(0.10 0.02 260 / 0.96))",
        boxShadow: "0 12px 36px rgba(0,0,0,0.38), inset 0 1px 0 oklch(1 0 0 / 0.04)"
      }}
    >
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[oklch(0.35_0.06_220_/_0.35)] bg-black/35"
        style={{
          boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.05)"
        }}
      >
        <KindIcon kind={attachment.kind} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium tracking-tight text-malv-text/[0.92]">{label}</p>
        {meta ? <p className="mt-0.5 truncate text-[10px] uppercase tracking-wider text-malv-text/42">{meta}</p> : null}
      </div>
    </motion.div>
  );
}
