import { motion } from "framer-motion";
import { AlertCircle, FileText, Loader2, RotateCcw, X } from "lucide-react";

/** Fixed composer thumbnail size (ChatGPT-style; stays small regardless of count). */
const THUMB_PX = 56;

export type ComposerAttachmentPreviewStatus = "uploading" | "ready" | "error";

export type ComposerAttachmentPreviewProps = {
  fileName: string;
  isImage: boolean;
  previewUrl?: string;
  status: ComposerAttachmentPreviewStatus;
  progress: number;
  errorMessage?: string;
  onRemove: () => void;
  onRetry?: () => void;
};

export function ComposerAttachmentPreview(props: ComposerAttachmentPreviewProps) {
  const {
    fileName,
    isImage,
    previewUrl,
    status,
    progress,
    errorMessage,
    onRemove,
    onRetry
  } = props;

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="relative shrink-0 overflow-hidden rounded-xl border border-white/[0.1] bg-black/40"
      style={{
        width: THUMB_PX,
        height: THUMB_PX,
        boxShadow: "0 4px 16px rgba(0,0,0,0.42), inset 0 1px 0 oklch(1 0 0 / 0.04)"
      }}
      title={fileName}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(100% 80% at 50% 0%, oklch(0.5 0.12 220 / 0.12), transparent 62%)"
        }}
      />

      {isImage && previewUrl ? (
        <img src={previewUrl} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-malv-text/40">
          <FileText className="h-6 w-6" strokeWidth={1.35} aria-hidden />
        </div>
      )}

      {status === "uploading" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 backdrop-blur-[1px]">
          <Loader2
            className="h-4 w-4 animate-spin text-[oklch(0.78_0.14_210)]"
            strokeWidth={2.2}
            aria-hidden
          />
          <div className="h-0.5 w-[70%] overflow-hidden rounded-full bg-white/[0.1]">
            <motion.div
              className="h-full rounded-full bg-[linear-gradient(90deg,oklch(0.52_0.14_220),oklch(0.58_0.12_270))]"
              initial={{ width: "0%" }}
              animate={{ width: `${Math.round(progress * 100)}%` }}
              transition={{ duration: 0.1, ease: "easeOut" }}
            />
          </div>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/70 px-1 backdrop-blur-[2px]">
          <AlertCircle className="h-4 w-4 shrink-0 text-[oklch(0.72_0.18_25)]" strokeWidth={2} aria-hidden />
          {onRetry ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRetry();
              }}
              className="inline-flex items-center gap-0.5 rounded-md border border-[oklch(0.45_0.08_220_/_0.45)] bg-white/[0.06] px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-[oklch(0.85_0.1_210)] hover:bg-white/[0.1]"
            >
              <RotateCcw className="h-2.5 w-2.5" aria-hidden />
              Retry
            </button>
          ) : null}
          <span className="sr-only">{errorMessage ?? "Error"}</span>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onRemove}
        className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-md border border-white/[0.12] bg-black/55 text-malv-text/90 backdrop-blur-sm transition-colors hover:bg-black/75 hover:text-malv-text focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.55_0.14_220_/_0.55)]"
        aria-label={`Remove ${fileName}`}
      >
        <X className="h-3 w-3" strokeWidth={2.5} />
      </button>
    </motion.div>
  );
}
