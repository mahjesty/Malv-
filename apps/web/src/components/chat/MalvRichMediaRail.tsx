import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, LineChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription } from "@/components/ui/dialog";
import { malvFaviconUrlForHttpUrl, type MalvRichMediaCard } from "@/lib/chat/malvRichResponsePresentation";

type MalvRichMediaRailProps = {
  cards: MalvRichMediaCard[];
  /** When user taps a source preview or wants attribution navigation */
  onOpenInternalUrl: (url: string, label: string) => void;
};

type LightboxState = { kind: "image"; index: number } | { kind: "chart"; index: number };

function Sparkline({ series, className }: { series: Array<{ t: string; v: number }>; className?: string }) {
  const pathD = useMemo(() => {
    if (!series.length) return "";
    const vals = series.map((p) => p.v);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    const n = series.length;
    if (n === 1) {
      const y = 36 - ((series[0]!.v - min) / span) * 32;
      return `M0,${y.toFixed(1)} L100,${y.toFixed(1)}`;
    }
    return series
      .map((p, i) => {
        const x = (i / (n - 1)) * 100;
        const y = 36 - ((p.v - min) / span) * 32;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join("");
  }, [series]);

  if (!series.length || !pathD) return null;

  return (
    <svg viewBox="0 0 100 40" className={className} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="malv-spark-fade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.72 0.16 200 / 0.35)" />
          <stop offset="100%" stopColor="oklch(0.72 0.16 200 / 0)" />
        </linearGradient>
      </defs>
      <path d={`${pathD} L100,40 L0,40 Z`} fill="url(#malv-spark-fade)" />
      <path d={pathD} fill="none" stroke="oklch(0.72 0.16 200 / 0.85)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function MalvRichMediaRail({ cards, onOpenInternalUrl }: MalvRichMediaRailProps) {
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  const flatImageIndices = useMemo(() => {
    const ix: number[] = [];
    cards.forEach((c, i) => {
      if (c.kind === "image") ix.push(i);
    });
    return ix;
  }, [cards]);

  const close = useCallback(() => setLightbox(null), []);

  const goImage = useCallback(
    (dir: -1 | 1) => {
      setLightbox((cur) => {
        if (!cur || cur.kind !== "image" || flatImageIndices.length === 0) return cur;
        const pos = flatImageIndices.indexOf(cur.index);
        if (pos < 0) return cur;
        const nextPos = (pos + dir + flatImageIndices.length) % flatImageIndices.length;
        return { kind: "image", index: flatImageIndices[nextPos]! };
      });
    },
    [flatImageIndices]
  );

  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (lightbox.kind === "image") {
        if (e.key === "ArrowLeft") goImage(-1);
        if (e.key === "ArrowRight") goImage(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, close, goImage]);

  if (!cards.length) return null;

  const openAt = (i: number) => {
    const c = cards[i];
    if (!c) return;
    if (c.kind === "image") setLightbox({ kind: "image", index: i });
    if (c.kind === "chart") setLightbox({ kind: "chart", index: i });
  };

  const lightboxCard = lightbox ? cards[lightbox.index] : null;

  return (
    <>
      <div className="relative -mx-1" data-testid="malv-rich-media-rail" role="region" aria-label="Media and references">
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-9 bg-gradient-to-l from-background via-background/70 to-transparent sm:w-10"
          aria-hidden
        />
        <div
          className="flex touch-pan-x gap-2 overflow-x-auto overscroll-x-contain scroll-p-3 px-3 pb-1 pr-7 [-ms-overflow-style:none] [scrollbar-width:none] snap-x snap-mandatory sm:scroll-p-4 sm:px-4 sm:pr-9 [&::-webkit-scrollbar]:hidden"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {cards.map((c, i) => {
            if (c.kind === "image") {
              return (
                <button
                  key={`img-${c.url}-${i}`}
                  type="button"
                  className="snap-center shrink-0 w-[min(232px,76vw)] overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-b from-white/[0.06] to-black/30 text-left shadow-[0_12px_40px_-24px_rgba(0,0,0,0.85)] ring-0 transition hover:border-malv-brand/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-malv-brand/40 dark:from-white/[0.04] dark:to-black/40"
                  onClick={() => openAt(i)}
                >
                  <div className="relative aspect-[16/10] w-full overflow-hidden bg-black/35">
                    <img
                      src={c.url}
                      alt={c.alt ?? "Reference"}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      draggable={false}
                    />
                  </div>
                  {(c.alt || c.source) && (
                    <div className="space-y-0.5 px-2.5 py-2">
                      {c.alt ? (
                        <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{c.alt}</p>
                      ) : null}
                      {c.source ? (
                        <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground/75">{c.source}</p>
                      ) : null}
                    </div>
                  )}
                </button>
              );
            }
            if (c.kind === "chart") {
              return (
                <button
                  key={`chart-${i}`}
                  type="button"
                  className="snap-center shrink-0 w-[min(232px,76vw)] overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-b from-white/[0.06] to-black/35 px-3 pb-2.5 pt-3 text-left shadow-[0_12px_40px_-24px_rgba(0,0,0,0.85)] transition hover:border-malv-brand/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-malv-brand/40"
                  onClick={() => openAt(i)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-semibold text-foreground/95">{c.title}</p>
                      {c.subtitle ? (
                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{c.subtitle}</p>
                      ) : null}
                    </div>
                    <LineChart className="size-4 shrink-0 text-malv-brand/80" aria-hidden />
                  </div>
                  <div className="mt-2 h-11 w-full overflow-hidden rounded-lg bg-black/25 px-1">
                    <Sparkline series={c.series} className="h-full w-full" />
                  </div>
                  {c.source ? (
                    <p className="mt-1.5 truncate text-[10px] uppercase tracking-wide text-muted-foreground/75">{c.source}</p>
                  ) : null}
                </button>
              );
            }
            const fav = malvFaviconUrlForHttpUrl(c.url);
            return (
              <button
                key={`src-${c.url}-${i}`}
                type="button"
                className="snap-center flex shrink-0 w-[min(232px,76vw)] flex-col gap-2 overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-b from-white/[0.05] to-black/35 p-3 text-left shadow-[0_12px_40px_-24px_rgba(0,0,0,0.85)] transition hover:border-malv-brand/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-malv-brand/40"
                onClick={() => onOpenInternalUrl(c.url, c.title)}
              >
                <div className="flex items-center gap-2">
                  {fav ? (
                    <img src={fav} alt="" className="size-8 rounded-lg border border-white/[0.08] bg-white/10 p-1" loading="lazy" />
                  ) : (
                    <div className="size-8 rounded-lg border border-white/[0.08] bg-white/[0.04]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold leading-tight text-foreground/95">{c.title}</p>
                    {c.hint ? <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{c.hint}</p> : null}
                  </div>
                </div>
                <span className="text-[10px] font-medium text-malv-brand/90">Preview in MALV</span>
              </button>
            );
          })}
        </div>
      </div>

      <Dialog open={lightbox !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent
          showCloseButton
          className="top-[50%] max-h-[min(92dvh,900px)] w-[min(100%,920px)] max-w-[calc(100%-0.75rem)] translate-y-[-50%] gap-0 overflow-hidden border-white/10 bg-black/95 p-0 sm:max-w-[min(100%,920px)]"
        >
          <DialogDescription className="sr-only">Expanded media viewer.</DialogDescription>
          {lightbox && lightboxCard?.kind === "image" ? (
            <div className="relative flex max-h-[min(92dvh,900px)] flex-col">
              <div className="flex min-h-0 flex-1 items-center justify-center bg-black px-2 py-3 sm:px-4">
                <img
                  src={lightboxCard.url}
                  alt={lightboxCard.alt ?? "Expanded reference"}
                  className="max-h-[min(72dvh,720px)] w-auto max-w-full object-contain"
                  draggable={false}
                />
              </div>
              <div className="flex shrink-0 items-center justify-between gap-2 border-t border-white/10 px-2 py-2 sm:px-3">
                <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0" onClick={() => goImage(-1)} aria-label="Previous">
                  <ChevronLeft className="size-5" />
                </Button>
                <div className="min-w-0 flex-1 px-1 text-center text-[11px] text-muted-foreground">
                  <span className="tabular-nums">
                    {flatImageIndices.indexOf(lightbox.index) + 1} / {flatImageIndices.length}
                  </span>
                  {lightboxCard.source ? (
                    <p className="mt-1 truncate text-[10px] uppercase tracking-wide opacity-80">{lightboxCard.source}</p>
                  ) : null}
                </div>
                <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0" onClick={() => goImage(1)} aria-label="Next">
                  <ChevronRight className="size-5" />
                </Button>
              </div>
            </div>
          ) : null}
          {lightbox && lightboxCard?.kind === "chart" ? (
            <div className="flex flex-col gap-3 p-4 sm:p-6">
              <div>
                <p className="text-sm font-semibold text-foreground">{lightboxCard.title}</p>
                {lightboxCard.subtitle ? <p className="mt-1 text-xs text-muted-foreground">{lightboxCard.subtitle}</p> : null}
              </div>
              <div className="h-40 w-full overflow-hidden rounded-xl border border-white/10 bg-black/40 p-2">
                <Sparkline series={lightboxCard.series} className="h-full w-full" />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
