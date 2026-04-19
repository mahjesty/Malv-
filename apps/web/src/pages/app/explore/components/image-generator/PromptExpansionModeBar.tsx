import { cn } from "@/lib/utils";
import {
  IMAGE_PROMPT_EXPANSION_MODES,
  PROMPT_EXPANSION_MODE_LABELS,
  type ImagePromptExpansionMode
} from "@/lib/explore/imagePromptExpansionMode";

export function PromptExpansionModeBar(props: {
  value: ImagePromptExpansionMode | null;
  onChange: (next: ImagePromptExpansionMode | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { value, onChange, disabled, className } = props;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-1.5 sm:justify-start sm:gap-2",
        className
      )}
      role="group"
      aria-label="Prompt expansion style"
    >
      <span className="w-full text-center text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/90 sm:w-auto sm:text-left">
        Expand as
      </span>
      <div className="flex flex-wrap justify-center gap-1 sm:justify-start">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(null)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors sm:text-xs",
            value === null
              ? "border-malv-f-ring-live/40 bg-malv-f-live/12 text-foreground"
              : "border-border/50 bg-muted/15 text-muted-foreground hover:border-border hover:bg-muted/25 hover:text-foreground",
            disabled && "pointer-events-none opacity-45"
          )}
        >
          Balanced
        </button>
        {IMAGE_PROMPT_EXPANSION_MODES.map((m) => (
          <button
            key={m}
            type="button"
            disabled={disabled}
            onClick={() => onChange(m)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors sm:text-xs",
              value === m
                ? "border-malv-f-ring-live/40 bg-malv-f-live/12 text-foreground"
                : "border-border/50 bg-muted/15 text-muted-foreground hover:border-border hover:bg-muted/25 hover:text-foreground",
              disabled && "pointer-events-none opacity-45"
            )}
          >
            {PROMPT_EXPANSION_MODE_LABELS[m]}
          </button>
        ))}
      </div>
    </div>
  );
}
