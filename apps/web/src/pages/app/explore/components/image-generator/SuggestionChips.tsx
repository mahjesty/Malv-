import { MalvButton } from "@/components/malv";

type Props = {
  suggestions: string[];
  disabled?: boolean;
  onSelect: (value: string) => void;
};

export function SuggestionChips({ suggestions, disabled, onSelect }: Props) {
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {suggestions.map((suggestion) => (
        <MalvButton
          key={suggestion}
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => onSelect(suggestion)}
          className="h-auto min-h-0 rounded-full border border-[color:var(--malv-color-border-subtle)] bg-[rgb(var(--malv-surface-base-rgb)/0.95)] px-2.5 py-1 text-[11px] font-normal text-[color:var(--malv-color-text-secondary)] hover:border-malv-f-live/35 hover:bg-[rgb(var(--malv-surface-raised-rgb)/0.98)] hover:text-malv-text"
        >
          {suggestion}
        </MalvButton>
      ))}
    </div>
  );
}
