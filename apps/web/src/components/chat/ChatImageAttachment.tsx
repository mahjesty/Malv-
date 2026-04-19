import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Maximize2, X } from "lucide-react";
import type { ChatAttachmentRef } from "@/lib/chat/types";
import { formatFileSize } from "@/lib/chat/chatAttachmentUtils";
import { lockBodyScroll } from "@/lib/ui/bodyScrollLock";

export type ChatImageAttachmentLayout = "featured" | "grid";

/** Sent-message multi-image only: smaller tiles (2–4) vs dense strip (5+). Composer uses separate preview. */
export type ChatImageGridDensity = "compact" | "dense";

export function ChatImageAttachment({
  attachment,
  layout = "featured",
  gridDensity = "compact"
}: {
  attachment: ChatAttachmentRef;
  layout?: ChatImageAttachmentLayout;
  gridDensity?: ChatImageGridDensity;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const src = attachment.url;
  const label = attachment.label ?? "Image";
  const mime = typeof attachment.metadata?.mimeType === "string" ? attachment.metadata.mimeType : undefined;
  const sizeBytes = attachment.metadata?.sizeBytes;
  const sizeStr =
    typeof sizeBytes === "number" && Number.isFinite(sizeBytes) ? formatFileSize(sizeBytes) : undefined;
  const footerBits = [mime, sizeStr].filter(Boolean).join(" · ");

  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setLightboxOpen(false);
  }, []);

  useEffect(() => {
    if (!lightboxOpen) return;
    window.addEventListener("keydown", onKey);
    const releaseScroll = lockBodyScroll();
    return () => {
      window.removeEventListener("keydown", onKey);
      releaseScroll();
    };
  }, [lightboxOpen, onKey]);

  const isGrid = layout === "grid";
  const isDense = isGrid && gridDensity === "dense";

  if (!src) {
    return (
      <div
        className={[
          "flex min-h-0 min-w-0 flex-col overflow-hidden border border-white/[0.08] bg-white/[0.03] text-left",
          isGrid
            ? isDense
              ? "h-full w-full rounded-lg p-2"
              : "h-full w-full rounded-xl p-2.5"
            : "w-full max-w-full rounded-[16px] p-4"
        ].join(" ")}
        style={{ boxShadow: "0 14px 40px rgba(0,0,0,0.35)" }}
      >
        <p className="text-[12px] text-malv-text/60">Preview unavailable</p>
        {!isGrid && footerBits ? <p className="mt-1 text-[10px] text-malv-text/40">{footerBits}</p> : null}
      </div>
    );
  }

  return (
    <>
      <motion.button
        type="button"
        layout={false}
        initial={{ opacity: 0, y: isGrid ? 4 : 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        onClick={() => setLightboxOpen(true)}
        className={[
          "group relative block min-h-0 min-w-0 cursor-zoom-in overflow-hidden border border-white/[0.09] text-left transition-[transform,box-shadow] duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.55_0.14_220_/_0.45)]",
          isGrid
            ? isDense
              ? "h-full w-full rounded-lg hover:-translate-y-0.5 hover:shadow-[0_8px_22px_rgba(0,0,0,0.4)]"
              : "h-full w-full rounded-xl hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(0,0,0,0.42)]"
            : "w-full max-w-full rounded-[16px] hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(0,0,0,0.44)]"
        ].join(" ")}
        style={{
          boxShadow: isGrid
            ? isDense
              ? "0 6px 18px rgba(0,0,0,0.34), inset 0 1px 0 oklch(1 0 0 / 0.05)"
              : "0 8px 24px rgba(0,0,0,0.36), inset 0 1px 0 oklch(1 0 0 / 0.05)"
            : "0 14px 40px rgba(0,0,0,0.4), inset 0 1px 0 oklch(1 0 0 / 0.05)"
        }}
        aria-label={`Open full screen preview: ${label}`}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(80% 60% at 50% 0%, oklch(0.55 0.14 220 / 0.14), transparent 65%)"
          }}
        />
        <img
          src={src}
          alt={label}
          className={[
            "z-0 object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]",
            isGrid
              ? "absolute inset-0 h-full w-full"
              : "relative block h-auto max-h-[min(40vh,320px)] w-full min-w-0"
          ].join(" ")}
          loading="lazy"
        />
        <div
          className={[
            "pointer-events-none absolute z-[2] flex items-center justify-center rounded-md border border-white/[0.1] bg-black/45 text-malv-text/85 opacity-0 backdrop-blur-md transition-all duration-200 group-hover:opacity-100",
            isDense
              ? "bottom-1 right-1 h-6 w-6 sm:bottom-1.5 sm:right-1.5"
              : isGrid
                ? "bottom-1.5 right-1.5 h-6 w-6 sm:bottom-2 sm:right-2 sm:h-7 sm:w-7"
                : "bottom-1.5 right-1.5 h-7 w-7 sm:bottom-2 sm:right-2 sm:h-8 sm:w-8"
          ].join(" ")}
        >
          <Maximize2
            className={isDense ? "h-2.5 w-2.5" : "h-3 w-3 sm:h-3.5 sm:w-3.5"}
            strokeWidth={2.2}
            aria-hidden
          />
        </div>
        {!isGrid && footerBits ? (
          <div className="relative z-[2] border-t border-white/[0.06] bg-black/30 px-3 py-1.5 backdrop-blur-sm">
            <p className="truncate text-[10px] text-malv-text/45">{footerBits}</p>
          </div>
        ) : null}
      </motion.button>

      <AnimatePresence>
        {lightboxOpen ? (
          <motion.div
            className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <button
              type="button"
              aria-label="Close preview"
              className="absolute inset-0 bg-black/88 backdrop-blur-sm"
              onClick={() => setLightboxOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Image preview"
              initial={{ scale: 0.94, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 8 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="relative z-[1] max-h-[min(92vh,900px)] w-full max-w-[min(96vw,1100px)] overflow-hidden rounded-[20px] border border-white/[0.1] bg-[oklch(0.08_0.02_260_/_0.96)] shadow-[0_24px_80px_rgba(0,0,0,0.65)]"
            >
              <button
                type="button"
                onClick={() => setLightboxOpen(false)}
                className="absolute right-3 top-3 z-[2] flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.1] bg-black/50 text-malv-text/85 backdrop-blur-md transition-colors hover:bg-black/65 hover:text-malv-text focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.55_0.14_220_/_0.5)]"
                aria-label="Close"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
              <div className="flex max-h-[min(92vh,900px)] items-center justify-center overflow-auto p-3 pt-14 sm:p-5 sm:pt-14">
                <img
                  src={src}
                  alt={label}
                  className="max-h-[min(78vh,820px)] w-auto max-w-full object-contain"
                />
              </div>
              <div className="border-t border-white/[0.06] px-4 py-2.5">
                <p className="truncate text-[11px] font-medium text-malv-text/[0.88]">{label}</p>
                {footerBits ? <p className="mt-0.5 text-[10px] text-malv-text/45">{footerBits}</p> : null}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
