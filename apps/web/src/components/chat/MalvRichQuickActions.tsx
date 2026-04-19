import { useCallback, useState } from "react";
import { ExternalLink, Forward, GitCompare, ListTree, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MalvRichActionItem, MalvRichSourceItem } from "@/lib/chat/malvRichResponsePresentation";

export type MalvRichQuickActionsProps = {
  actions: MalvRichActionItem[];
  sources: MalvRichSourceItem[];
  assistantText: string;
  onInternalPreview: (url: string, label: string) => void;
  onOpenCompare: () => void;
};

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand("copy");
    return true;
  } catch {
    return false;
  } finally {
    document.body.removeChild(ta);
  }
}

function iconFor(id: MalvRichActionItem["id"]) {
  switch (id) {
    case "open_primary_source":
      return Sparkles;
    case "open_externally":
      return ExternalLink;
    case "summarize_sources":
      return ListTree;
    case "compare_sources":
      return GitCompare;
    case "save_turn":
      return Save;
    case "send_to_task":
      return Forward;
    default:
      return Sparkles;
  }
}

/**
 * Compact contextual affordances for structured capability replies.
 */
export function MalvRichQuickActions({
  actions,
  sources,
  assistantText,
  onInternalPreview,
  onOpenCompare
}: MalvRichQuickActionsProps) {
  const [flash, setFlash] = useState<string | null>(null);

  const pulse = useCallback((msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 1400);
  }, []);

  const onAction = useCallback(
    async (a: MalvRichActionItem) => {
      if (a.id === "open_primary_source") {
        const u = sources[0]?.url ?? a.url;
        if (u) onInternalPreview(u, sources[0]?.title ?? "Source");
        return;
      }
      if (a.id === "open_externally") {
        const u = a.url ?? sources[0]?.url;
        if (u) onInternalPreview(u, sources[0]?.title ?? "Source");
        return;
      }
      if (a.id === "compare_sources") {
        onOpenCompare();
        return;
      }
      if (a.id === "summarize_sources") {
        const blob = [
          assistantText.trim(),
          "",
          "Sources:",
          ...sources.map((s) => `- ${s.title}: ${s.url}`)
        ].join("\n");
        const ok = await copyText(blob);
        pulse(ok ? "Outline copied" : "Copy blocked");
        return;
      }
      if (a.id === "save_turn") {
        const ok = await copyText(assistantText.trim());
        pulse(ok ? "Reply copied" : "Copy blocked");
        return;
      }
      if (a.id === "send_to_task") {
        window.dispatchEvent(
          new CustomEvent("malv:send-to-task", {
            detail: { text: assistantText.trim(), sources }
          })
        );
        pulse("Queued for tasks");
        return;
      }
    },
    [assistantText, onInternalPreview, onOpenCompare, pulse, sources]
  );

  if (!actions.length) return null;

  return (
    <div className="space-y-1.5" data-testid="malv-rich-quick-actions">
      <div className="flex gap-1.5 overflow-x-auto overflow-y-hidden pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {actions.map((a) => {
          const Icon = iconFor(a.id);
          return (
            <Button
              key={`${a.id}-${a.label}`}
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-1.5 rounded-full border-white/[0.1] bg-white/[0.03] px-3 text-[11px] font-medium text-foreground/90 hover:bg-malv-brand/12 hover:text-foreground"
              onClick={() => void onAction(a)}
            >
              <Icon className="size-3.5 opacity-90" aria-hidden />
              {a.label}
            </Button>
          );
        })}
      </div>
      {flash ? <p className="text-[10px] text-muted-foreground">{flash}</p> : null}
    </div>
  );
}
