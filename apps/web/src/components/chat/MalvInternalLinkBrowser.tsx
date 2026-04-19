import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getMalvExternalOpenHintsFromBrowser,
  resolveMalvExternalOpenButtonLabel,
  resolveMalvExternalOpenPreviewAriaDescription
} from "@/lib/device/malv-external-open";

export type MalvInternalLinkBrowserProps = {
  open: boolean;
  url: string | null;
  /** Optional heading (e.g. pill label). */
  label?: string | null;
  onOpenChange: (open: boolean) => void;
};

function safeHostname(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./i, "");
  } catch {
    return "Page";
  }
}

/**
 * In-app link preview: iframe when allowed, with a platform-aware external-open utility in the header.
 */
export function MalvInternalLinkBrowser({ open, url, label, onOpenChange }: MalvInternalLinkBrowserProps) {
  const [frameFailed, setFrameFailed] = useState(false);
  const resolved = useMemo(() => (url && /^https?:\/\//i.test(url.trim()) ? url.trim() : null), [url]);

  const { externalLabel, externalAria } = useMemo(() => {
    const h = getMalvExternalOpenHintsFromBrowser();
    return {
      externalLabel: resolveMalvExternalOpenButtonLabel(h),
      externalAria: resolveMalvExternalOpenPreviewAriaDescription(h)
    };
  }, []);

  useEffect(() => {
    setFrameFailed(false);
  }, [resolved, open]);

  const onFrameError = useCallback(() => setFrameFailed(true), []);

  const hostTitle = resolved ? safeHostname(resolved) : "Preview";

  const externalLink = resolved ? (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 shrink-0 gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
      asChild
    >
      <a href={resolved} target="_blank" rel="noopener noreferrer" data-testid="malv-internal-browser-external-open">
        <ExternalLink className="size-3 shrink-0 opacity-80" aria-hidden />
        {externalLabel}
      </a>
    </Button>
  ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        data-testid="malv-internal-browser"
        className="top-[52%] flex h-[min(88dvh,760px)] w-[min(100%,720px)] max-w-[calc(100%-1rem)] translate-y-[-50%] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(100%,720px)]"
      >
        <DialogDescription className="sr-only">{externalAria}</DialogDescription>
        <DialogHeader className="shrink-0 space-y-0 border-b border-white/[0.08] px-3 py-2.5 pr-12 dark:border-white/[0.08]">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 space-y-0">
              <DialogTitle className="truncate text-left text-sm font-medium text-foreground/95">
                {label?.trim() || hostTitle}
              </DialogTitle>
              <p className="truncate text-left text-[11px] text-muted-foreground">{hostTitle}</p>
            </div>
            {externalLink}
          </div>
        </DialogHeader>
        <div className="relative min-h-0 flex-1 bg-black/40">
          {resolved && !frameFailed ? (
            <iframe
              title={hostTitle}
              src={resolved}
              className="absolute inset-0 h-full w-full border-0"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              onError={onFrameError}
            />
          ) : resolved && frameFailed ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
              <p>This site cannot be embedded here (blocked by the publisher).</p>
              <Button variant="secondary" size="sm" className="h-8 gap-1.5 text-xs" asChild>
                <a href={resolved} target="_blank" rel="noopener noreferrer" data-testid="malv-internal-browser-fallback-external-open">
                  <ExternalLink className="size-3.5 opacity-80" aria-hidden />
                  {externalLabel}
                </a>
              </Button>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No URL</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
