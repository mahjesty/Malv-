import { ChevronLeft, ChevronRight, Palette } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { ImageUploadModal } from "./ImageUploadModal";
import { ModeCard } from "./ModeCard";
import type { ImageModeCard } from "./constants";

type Props = {
  cards: readonly ImageModeCard[];
  disabled?: boolean;
  onLaunch: (card: ImageModeCard, file?: File) => void;
};

export function ModeGallery({ cards, disabled = false, onLaunch }: Props) {
  const [uploadCard, setUploadCard] = useState<ImageModeCard | null>(null);
  const transformCards = useMemo(() => cards.filter((card) => card.category === "transform"), [cards]);
  const discoveryCards = useMemo(() => cards.filter((card) => card.category === "prompt"), [cards]);
  const createCards = useMemo(() => cards.filter((card) => card.category === "guided"), [cards]);

  const handleLaunch = (card: ImageModeCard) => {
    if (card.requiresUpload || card.category === "transform") {
      setUploadCard(card);
      return;
    }
    onLaunch(card);
  };

  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--malv-color-text-muted)]">
            Visual mode launcher
          </p>
          <p className="mt-1 text-[13px] text-[color:var(--malv-color-text-secondary)]">
            Browse real output previews and launch instantly
          </p>
        </div>
      </div>

      <CarouselSection
        title="Try a style on an image"
        subtitle="Upload a photo, then apply a complete visual transformation"
        cards={transformCards}
        disabled={disabled}
        onLaunch={handleLaunch}
      />

      {discoveryCards.length > 0 ? (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[13px] font-semibold text-malv-text">Discover something new</h3>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--malv-color-text-muted)]">
              Prompt ideas
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {discoveryCards.map((card) => (
              <ModeCard key={card.id} card={card} disabled={disabled} onLaunch={handleLaunch} compact />
            ))}
          </div>
        </section>
      ) : null}

      {createCards.length > 0 ? (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[13px] font-semibold text-malv-text">Create from scratch</h3>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--malv-color-text-muted)]">
              Guided flows
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {createCards.map((card) => (
              <ModeCard key={card.id} card={card} disabled={disabled} onLaunch={handleLaunch} compact />
            ))}
          </div>
        </section>
      ) : null}

      <ImageUploadModal
        open={Boolean(uploadCard)}
        card={uploadCard}
        busy={disabled}
        onClose={() => setUploadCard(null)}
        onConfirm={(file) => {
          if (uploadCard) onLaunch(uploadCard, file);
          setUploadCard(null);
        }}
      />
    </section>
  );
}

type CarouselSectionProps = {
  title: string;
  subtitle: string;
  cards: readonly ImageModeCard[];
  disabled?: boolean;
  onLaunch: (card: ImageModeCard) => void;
};

function CarouselSection({ title, subtitle, cards, disabled = false, onLaunch }: CarouselSectionProps) {
  const railRef = useRef<HTMLDivElement | null>(null);

  const scrollByAmount = (direction: "left" | "right") => {
    const rail = railRef.current;
    if (!rail) return;
    const amount = Math.max(rail.clientWidth * 0.72, 280);
    rail.scrollBy({ left: direction === "left" ? -amount : amount, behavior: "smooth" });
  };

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-semibold text-malv-text">{title}</h3>
          <p className="text-[12px] text-[color:var(--malv-color-text-secondary)]">{subtitle}</p>
        </div>
        <div className="hidden items-center gap-1.5 sm:flex">
          <button
            type="button"
            onClick={() => scrollByAmount("left")}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/8 text-white/75 transition hover:bg-white/16 hover:text-white"
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollByAmount("right")}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/8 text-white/75 transition hover:bg-white/16 hover:text-white"
            aria-label="Scroll right"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="relative">
        <div
          ref={railRef}
          className="-mx-2 flex snap-x snap-mandatory gap-4 overflow-x-auto px-2 pb-2 scroll-smooth [scrollbar-width:none]"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {cards.map((card) => (
            <ModeCard key={card.id} card={card} disabled={disabled} onLaunch={onLaunch} />
          ))}
        </div>
      </div>
    </section>
  );
}

/** Image studio: transform rail only (same ModeCard + carousel as ModeGallery, zinc shell styling). */
export function ImageTransformCarouselRail(props: {
  cards: readonly ImageModeCard[];
  disabled?: boolean;
  onPickCard: (card: ImageModeCard) => void;
}) {
  const { cards, disabled = false, onPickCard } = props;
  const railRef = useRef<HTMLDivElement | null>(null);

  const scrollByAmount = (direction: "left" | "right") => {
    const rail = railRef.current;
    if (!rail) return;
    const amount = Math.max(rail.clientWidth * 0.65, 240);
    rail.scrollBy({ left: direction === "left" ? -amount : amount, behavior: "smooth" });
  };

  return (
    <section className="space-y-3 sm:space-y-6 lg:space-y-8">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center gap-1.5 sm:mb-3 sm:gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-malv-f-gold/14 ring-1 ring-malv-f-gold/18 sm:h-8 sm:w-8">
              <Palette className="h-3.5 w-3.5 text-malv-f-gold sm:h-4 sm:w-4" />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-malv-f-gold min-[400px]:text-[10px] sm:text-xs sm:tracking-widest">
              Visual modes
            </span>
          </div>
          <h2 className="text-balance text-lg font-bold leading-snug tracking-tight text-foreground min-[400px]:text-xl sm:text-3xl lg:text-4xl">
            Visual transformations
          </h2>
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <button
            type="button"
            onClick={() => scrollByAmount("left")}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-muted/30 text-muted-foreground transition hover:bg-muted/45 hover:text-foreground"
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => scrollByAmount("right")}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-muted/30 text-muted-foreground transition hover:bg-muted/45 hover:text-foreground"
            aria-label="Scroll right"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="relative -mx-3 sm:-mx-0">
        <div
          ref={railRef}
          className="flex snap-x snap-mandatory gap-1.5 overflow-x-auto scroll-smooth px-3 pb-2 pt-0.5 [scrollbar-width:none] min-[400px]:gap-2 sm:gap-3 sm:px-1 sm:pb-1.5 sm:pt-0 [&::-webkit-scrollbar]:hidden"
          style={{ WebkitOverflowScrolling: "touch", scrollSnapType: "x mandatory" }}
        >
          {cards.map((card) => (
            <ModeCard key={card.id} card={card} disabled={disabled} onLaunch={onPickCard} dense />
          ))}
        </div>
      </div>
    </section>
  );
}
