import { useEffect, useRef, useState } from "react";
import { Button } from "@malv/ui";
import { ImageIcon, UploadCloud, X } from "lucide-react";
import type { ImageModeCard } from "./constants";

type Props = {
  open: boolean;
  card: ImageModeCard | null;
  busy?: boolean;
  /** When true, choosing a file immediately starts staging via `onConfirm` (upload-to-thread flows). */
  launchOnFileSelect?: boolean;
  /** Localized upload / sizing guidance (replaces raw server errors in this flow). */
  notice?: string | null;
  /** Shown under the notice in development only (raw server/network detail). */
  devErrorDetail?: string | null;
  onClose: () => void;
  onConfirm: (file: File) => void;
};

export function ImageUploadModal({
  open,
  card,
  busy = false,
  launchOnFileSelect = false,
  notice = null,
  devErrorDetail = null,
  onClose,
  onConfirm
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  /** Prevents double navigation when `launchOnFileSelect` fires `onConfirm` and the user also taps "Use this image". */
  const autoLaunchCommittedRef = useRef(false);
  const prevOpenRef = useRef(false);
  const lastCardIdWhenOpenRef = useRef<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (notice) autoLaunchCommittedRef.current = false;
  }, [notice]);

  useEffect(() => {
    if (!open) {
      autoLaunchCommittedRef.current = false;
      prevOpenRef.current = false;
      return;
    }
    const entering = !prevOpenRef.current;
    prevOpenRef.current = true;
    const cardId = card?.id ?? null;
    const cardChangedWhileOpen = !entering && lastCardIdWhenOpenRef.current !== cardId;
    lastCardIdWhenOpenRef.current = cardId;

    if (card && (entering || cardChangedWhileOpen)) {
      setFile(null);
      setPreviewUrl(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [open, card?.id]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!open || !card) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        className="flex max-h-[min(92dvh,720px)] w-full max-w-md flex-col rounded-t-2xl border border-[color:var(--malv-color-border-subtle)] border-b-0 bg-[rgb(var(--malv-surface-overlay-rgb))] shadow-[0_24px_80px_rgba(0,0,0,0.65),inset_0_0_0_1px_rgb(255_255_255/0.05)] sm:max-h-[min(88dvh,640px)] sm:rounded-2xl sm:border-b"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[color:var(--malv-color-border-subtle)] px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
          <div className="min-w-0 pr-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--malv-color-text-muted)] sm:text-[11px]">
              Source image
            </p>
            <h3 className="mt-1 text-[17px] font-semibold leading-snug tracking-tight text-malv-text sm:text-[18px]">{card.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2.5 text-[color:var(--malv-color-text-muted)] transition hover:bg-[rgb(var(--malv-border-rgb)/0.08)] hover:text-malv-text"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const next = event.target.files?.[0] ?? null;
              setFile(next);
              if (next && launchOnFileSelect && !busy) {
                if (autoLaunchCommittedRef.current) return;
                autoLaunchCommittedRef.current = true;
                onConfirm(next);
              }
            }}
          />

          {!file ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[color:var(--malv-color-border-strong)] bg-[rgb(var(--malv-surface-base-rgb)/0.92)] px-4 py-10 text-center transition hover:border-malv-f-live/32 hover:bg-[rgb(var(--malv-surface-raised-rgb)/0.96)] disabled:opacity-45"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[rgb(var(--malv-border-rgb)/0.06)] ring-1 ring-[color:var(--malv-color-border-subtle)]">
                <UploadCloud className="h-5 w-5 text-[color:var(--malv-color-text-muted)]" />
              </div>
              <div>
                <p className="text-[14px] font-medium text-malv-text">Choose source image</p>
                <p className="mt-1 text-[12px] text-[color:var(--malv-color-text-muted)]">JPEG, PNG, or WebP</p>
              </div>
            </button>
          ) : (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-xl bg-[rgb(var(--malv-surface-void-rgb))] ring-1 ring-[color:var(--malv-color-border-subtle)]">
                {previewUrl ? (
                  <img src={previewUrl} alt="" className="aspect-[4/3] w-full object-cover sm:aspect-[16/10]" />
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center sm:aspect-[16/10]">
                    <ImageIcon className="h-8 w-8 text-[color:var(--malv-color-text-muted)]" />
                  </div>
                )}
              </div>
              <div className="flex items-start gap-3 rounded-lg bg-[rgb(var(--malv-border-rgb)/0.04)] px-3 py-2.5 ring-1 ring-[color:var(--malv-color-border-subtle)]">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-malv-f-live/12 ring-1 ring-malv-f-live/18">
                  <ImageIcon className="h-4 w-4 text-malv-f-live" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[color:var(--malv-color-text-muted)]">
                    Selected
                  </p>
                  <p className="mt-0.5 truncate text-[13px] font-medium text-malv-text" title={file.name}>
                    {file.name}
                  </p>
                  <p className="mt-1 text-[12px] text-[color:var(--malv-color-text-secondary)]">
                    Ready to apply <span className="text-malv-text">{card.title}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    autoLaunchCommittedRef.current = false;
                    setFile(null);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                  className="shrink-0 self-center text-[12px] font-medium text-[color:var(--malv-color-text-muted)] underline-offset-2 hover:text-malv-f-live"
                >
                  Change
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2.5 border-t border-[color:var(--malv-color-border-subtle)] px-4 py-4 sm:flex-row sm:gap-3 sm:px-5 sm:py-5">
          {busy && file ? (
            <p
              role="status"
              className="w-full text-center text-[12px] text-[color:var(--malv-color-text-muted)] sm:order-first sm:w-full"
            >
              Staging upload…
            </p>
          ) : null}
          {notice ? (
            <div className="w-full space-y-2 sm:order-first sm:w-full">
              <p
                role="status"
                className="w-full rounded-lg bg-malv-f-gold/[0.08] px-3 py-2.5 text-[12px] leading-relaxed text-malv-text ring-1 ring-malv-f-gold/22"
              >
                {notice}
              </p>
              {devErrorDetail ? (
                <pre className="max-h-28 w-full overflow-auto rounded-lg bg-[rgb(var(--malv-surface-void-rgb))] px-3 py-2 text-[11px] leading-snug text-[color:var(--malv-color-text-secondary)] ring-1 ring-[color:var(--malv-color-border-subtle)]">
                  {devErrorDetail}
                </pre>
              ) : null}
              {file && !busy ? (
                <button
                  type="button"
                  className="text-[12px] font-medium text-malv-f-live underline-offset-2 hover:underline"
                  onClick={() => {
                    autoLaunchCommittedRef.current = false;
                    onConfirm(file);
                  }}
                >
                  Try upload again
                </button>
              ) : null}
            </div>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="min-h-11 w-full sm:min-h-10 sm:flex-1"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!file || busy}
            onClick={() => {
              if (!file) return;
              if (launchOnFileSelect && autoLaunchCommittedRef.current) return;
              autoLaunchCommittedRef.current = true;
              onConfirm(file);
            }}
            className="min-h-11 w-full sm:min-h-10 sm:flex-1"
          >
            Use this image
          </Button>
        </div>
      </div>
    </div>
  );
}
