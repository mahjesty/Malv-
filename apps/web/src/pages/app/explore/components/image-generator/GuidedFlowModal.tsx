import { useEffect, useMemo, useState } from "react";
import { Button } from "@malv/ui";
import { X } from "lucide-react";
import { buildGuidedPrompt, type ImageModeCard } from "./constants";

type Props = {
  open: boolean;
  card: ImageModeCard | null;
  busy?: boolean;
  onClose: () => void;
  onSubmitAnswers: (mergedPrompt: string) => void;
};

export function GuidedFlowModal({ open, card, busy = false, onClose, onSubmitAnswers }: Props) {
  const fields = useMemo(() => card?.guidedFields ?? [], [card?.guidedFields]);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open && card) {
      setAnswers({});
    }
  }, [open, card?.id]);

  if (!open || !card) return null;

  const canSubmit =
    fields.length > 0 &&
    fields.every((f) => {
      const v = (answers[f.id] ?? "").trim();
      return v.length > 0;
    });

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        className="flex max-h-[min(92dvh,720px)] w-full max-w-md flex-col rounded-t-2xl border border-[color:var(--malv-color-border-subtle)] border-b-0 bg-[rgb(var(--malv-surface-overlay-rgb))] shadow-[0_24px_80px_rgba(0,0,0,0.65),inset_0_0_0_1px_rgb(255_255_255/0.05)] sm:max-h-[min(88dvh,640px)] sm:rounded-2xl sm:border-b"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[color:var(--malv-color-border-subtle)] px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
          <div className="min-w-0 pr-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--malv-color-text-muted)] sm:text-[11px]">
              Guided setup
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

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
          {fields.map((f) => (
            <label key={f.id} className="block">
              <span className="mb-1 block text-[11px] font-medium text-[color:var(--malv-color-text-secondary)]">{f.label}</span>
              <input
                type="text"
                value={answers[f.id] ?? ""}
                placeholder={f.placeholder}
                disabled={busy}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [f.id]: e.target.value }))}
                className="min-h-11 w-full rounded-lg border border-[color:var(--malv-color-border-subtle)] bg-[rgb(var(--malv-f-surface-rgb))] px-3 py-2.5 text-[13px] text-malv-text placeholder:text-[color:var(--malv-color-text-placeholder)] focus:border-malv-f-ring-live/45 focus:outline-none focus:ring-2 focus:ring-malv-f-ring-live/25 disabled:opacity-50 sm:min-h-10 sm:py-2"
              />
            </label>
          ))}
        </div>

        <div className="flex shrink-0 flex-col gap-2.5 border-t border-[color:var(--malv-color-border-subtle)] px-4 py-4 sm:flex-row sm:gap-3 sm:px-5 sm:py-5">
          <Button type="button" variant="secondary" onClick={onClose} className="min-h-11 w-full sm:min-h-10 sm:flex-1">
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!canSubmit || busy}
            onClick={() => {
              const merged = buildGuidedPrompt(card, answers).trim();
              if (!merged) return;
              onSubmitAnswers(merged);
            }}
            className="min-h-11 w-full sm:min-h-10 sm:flex-1"
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
