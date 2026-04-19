import { useState } from "react";
import type { MalvChatMessage } from "../../lib/chat/types";
import {
  malvFaviconUrlForHttpUrl,
  malvFormatSourcePillLabel,
  malvHostBadgeForUrl,
  malvRichResponseHasSurface,
  parseMalvRichResponse,
  shouldRenderMalvSourcePills
} from "../../lib/chat/malvRichResponsePresentation";
import { MalvInternalLinkBrowser } from "./MalvInternalLinkBrowser";
import { MalvRichMediaRail } from "./MalvRichMediaRail";
import { MalvRichQuickActions } from "./MalvRichQuickActions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getMalvExternalOpenHintsFromBrowser,
  malvPruneExternalOpenQuickActions,
  resolveMalvExternalOpenSourcesFlowBlurb
} from "@/lib/device/malv-external-open";

/**
 * Premium structured surface: evidence pills → swipeable media rail → contextual actions.
 * Answer text stays in {@link MalvMessageBody}; this block never injects raw URLs into the thread.
 */
export function MalvRichResponseBlock({ msg }: { msg: MalvChatMessage }) {
  const [browser, setBrowser] = useState<{ url: string; label: string } | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);

  if (msg.role !== "assistant") return null;
  const meta = msg.metadata;
  if (!meta || typeof meta !== "object") return null;
  const parsed = parseMalvRichResponse(meta as Record<string, unknown>);
  if (!parsed || !malvRichResponseHasSurface(parsed)) return null;

  const showPills = shouldRenderMalvSourcePills(parsed);
  const showMedia = parsed.media.length > 0;
  const visibleQuickActions = malvPruneExternalOpenQuickActions(parsed.actions);
  const showActions = visibleQuickActions.length > 0;
  const sourcesCompareBlurb = resolveMalvExternalOpenSourcesFlowBlurb(getMalvExternalOpenHintsFromBrowser());

  const leadIn = parsed.executionLeadIn?.trim();

  return (
    <div
      className="mt-2.5 space-y-2.5 border-t border-white/[0.08] pt-2.5 dark:border-white/[0.08]"
      data-testid="malv-rich-response-block"
    >
      {leadIn ? (
        <p
          className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px] leading-snug text-muted-foreground/95"
          data-testid="malv-rich-execution-lead-in"
        >
          {leadIn}
        </p>
      ) : null}
      {showPills ? (
        <div className="flex flex-wrap gap-1.5" data-testid="malv-source-pills">
          {parsed.sources.map((s) => {
            const label = malvFormatSourcePillLabel(s);
            const fav = malvFaviconUrlForHttpUrl(s.url);
            const host = malvHostBadgeForUrl(s.url);
            return (
              <button
                key={s.url}
                type="button"
                className="inline-flex max-w-[min(100%,260px)] items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] py-1 pl-1.5 pr-3 text-left text-[11px] font-medium text-foreground/90 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] transition hover:border-malv-brand/35 hover:bg-malv-brand/10 hover:text-foreground active:translate-y-px dark:text-malv-text/90"
                onClick={() => setBrowser({ url: s.url, label })}
              >
                {fav ? (
                  <img src={fav} alt="" className="size-6 shrink-0 rounded-full border border-white/[0.08] bg-white/10 p-0.5" loading="lazy" />
                ) : (
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05] text-[9px] text-muted-foreground">
                    ···
                  </span>
                )}
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate">{label}</span>
                  {host ? <span className="block truncate text-[9px] font-normal text-muted-foreground/75">{host}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {showMedia ? (
        <MalvRichMediaRail cards={parsed.media} onOpenInternalUrl={(url, label) => setBrowser({ url, label })} />
      ) : null}

      {showActions ? (
        <MalvRichQuickActions
          actions={visibleQuickActions}
          sources={parsed.sources}
          assistantText={msg.content}
          onInternalPreview={(url, label) => setBrowser({ url, label })}
          onOpenCompare={() => setCompareOpen(true)}
        />
      ) : null}

      <MalvInternalLinkBrowser
        open={browser !== null}
        url={browser?.url ?? null}
        label={browser?.label}
        onOpenChange={(o) => {
          if (!o) setBrowser(null);
        }}
      />

      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-md border-white/10 bg-background/95 p-0" showCloseButton>
          <DialogHeader className="border-b border-white/[0.08] px-4 py-3">
            <DialogTitle className="text-left text-sm">Sources</DialogTitle>
            <DialogDescription className="text-left text-xs text-muted-foreground">{sourcesCompareBlurb}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50dvh] space-y-1 overflow-y-auto px-3 py-2 pb-4">
            {parsed.sources.map((s) => (
              <Button
                key={s.url}
                type="button"
                variant="ghost"
                className="h-auto w-full justify-start gap-2 rounded-xl px-2 py-2 text-left"
                onClick={() => {
                  setCompareOpen(false);
                  setBrowser({ url: s.url, label: malvFormatSourcePillLabel(s) });
                }}
              >
                {malvFaviconUrlForHttpUrl(s.url) ? (
                  <img
                    src={malvFaviconUrlForHttpUrl(s.url)!}
                    alt=""
                    className="size-7 shrink-0 rounded-lg border border-white/[0.08] bg-white/5 p-0.5"
                    loading="lazy"
                  />
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{malvFormatSourcePillLabel(s)}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">{malvHostBadgeForUrl(s.url)}</span>
                </span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
