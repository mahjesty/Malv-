/**
 * Explore Image Generator — Vercel frontend shell (from provided Next page) adapted for MALV.
 * Presentation + section hierarchy match the shipped Vercel layout; data and actions are wired via props.
 */
import { useState, type Ref, type RefObject } from "react";
import { motion } from "framer-motion";
import { ImageIcon, Send, Sparkles, Download, MoreHorizontal } from "lucide-react";

import { MalvButton } from "@/components/malv";
import { cn } from "@/lib/utils";
import type { ImageModeCard } from "./components/image-generator/constants";
import { ImageTransformCarouselRail } from "./components/image-generator/ModeGallery";

/** Matches uploaded Vercel image page: max-w-7xl shell, original section stack (space-y-16/20/24). */
const SHELL = {
  sectionMotion: { initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-40px" }, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } }
} as const;

type HistoryGalleryItem = {
  id: string;
  imageUrl: string;
  prompt: string;
  text: string;
  createdAt: number;
};

// ─── Composer — compact neutral chrome (no accent glow / tint) ────────────────

export function ExploreImagePromptComposer(props: {
  prompt: string;
  setPrompt: (v: string) => void;
  placeholder: string;
  disabled: boolean;
  onSubmit: () => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** Wider, softer chrome for the image session page only (launcher keeps default). */
  variant?: "default" | "session";
}) {
  const { prompt, setPrompt, placeholder, disabled, onSubmit, textareaRef, variant = "default" } = props;
  const session = variant === "session";

  return (
    <div className={cn("relative mx-auto w-full px-0", session ? "max-w-3xl" : "max-w-lg")}>
      <div
        className={cn(
          "explore-img-prompt-shell flex min-h-[48px] items-stretch gap-2 px-3 py-2 backdrop-blur-md min-[400px]:gap-2.5 min-[400px]:px-3.5 sm:min-h-[52px] sm:gap-3 sm:px-4 sm:py-2.5",
          session
            ? "rounded-2xl border border-[color:var(--malv-color-border-strong)] bg-gradient-to-b from-[rgb(var(--malv-surface-overlay-rgb)/0.94)] to-[rgb(var(--malv-surface-base-rgb)/0.98)] shadow-[0_16px_48px_rgba(0,0,0,0.5),0_0_0_1px_rgb(var(--malv-border-rgb)/0.06)_inset,inset_0_1px_0_rgb(255_255_255/0.07)]"
            : "rounded-xl border border-[color:var(--malv-color-border-strong)] bg-[rgb(var(--malv-f-surface-hi-rgb)/0.96)] shadow-[0_10px_32px_rgba(0,0,0,0.35),0_0_0_1px_rgb(var(--malv-border-rgb)/0.05)_inset]"
        )}
      >
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center self-center sm:h-8 sm:w-8",
            session ? "rounded-xl bg-[rgb(var(--malv-border-rgb)/0.06)]" : "rounded-md bg-muted/35"
          )}
        >
          <ImageIcon
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              session ? "text-[color:var(--malv-color-text-muted)]" : "text-muted-foreground"
            )}
          />
        </div>
        <textarea
          ref={textareaRef as Ref<HTMLTextAreaElement>}
          id="explore-img-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={placeholder}
          rows={1}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !disabled) {
              e.preventDefault();
              onSubmit();
            }
          }}
          className={cn(
            "min-h-[40px] max-h-[120px] w-full min-w-0 flex-1 resize-none border-0 bg-transparent py-2.5 text-[14px] leading-[1.45] shadow-none antialiased placeholder:text-[color:var(--malv-color-text-placeholder)] focus:border-0 focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:min-h-[40px] sm:py-2.5 sm:text-[14px]",
            session ? "text-malv-text" : "text-foreground"
          )}
        />
        <MalvButton
          type="button"
          variant="primary"
          className={cn(
            "h-10 w-10 shrink-0 self-center p-0 shadow-[inset_0_1px_0_rgb(var(--malv-f-live-rgb)/0.18),0_2px_14px_rgb(var(--malv-f-live-rgb)/0.2)] disabled:opacity-40 sm:h-10 sm:w-10",
            session ? "rounded-xl" : "rounded-xl"
          )}
          disabled={disabled || !prompt.trim()}
          onClick={onSubmit}
        >
          <Send className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </MalvButton>
      </div>
    </div>
  );
}

function GalleryImageCard({
  item,
  onDownload,
  onOpen
}: {
  item: HistoryGalleryItem;
  onDownload: (url: string) => void;
  onOpen: (item: HistoryGalleryItem) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      className="group relative aspect-[4/3] cursor-pointer overflow-hidden rounded-2xl shadow-sm shadow-black/40"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(item);
        }
      }}
    >
      <img
        src={item.imageUrl}
        alt=""
        className={cn(
          "absolute inset-0 h-full w-full object-cover transition-all duration-500",
          hovered ? "scale-105 brightness-75" : "scale-100 brightness-100"
        )}
      />
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-opacity duration-300",
          hovered ? "opacity-100" : "opacity-0"
        )}
      />

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 p-4 transition-all duration-300",
          hovered ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        )}
      >
        <span className="mb-1 block text-xs font-medium text-white/60">Saved</span>
        <p className="line-clamp-2 text-sm font-semibold text-white sm:text-base">{item.prompt}</p>
        <div className="mt-3 flex items-center gap-2">
          <MalvButton
            type="button"
            variant="secondary"
            className="h-8 w-8 rounded-lg border-white/20 bg-black/45 p-0 text-white shadow-none backdrop-blur-md hover:border-white/28 hover:bg-black/58"
            onClick={(e) => {
              e.stopPropagation();
              onDownload(item.imageUrl);
            }}
          >
            <Download className="h-4 w-4" aria-hidden />
          </MalvButton>
          <MalvButton
            type="button"
            variant="secondary"
            className="h-8 w-8 rounded-lg border-white/20 bg-black/45 p-0 text-white shadow-none backdrop-blur-md hover:border-white/28 hover:bg-black/58"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(item);
            }}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </MalvButton>
        </div>
      </div>
    </div>
  );
}

function GallerySection(props: {
  items: HistoryGalleryItem[];
  onDownload: (url: string) => void;
  onSelect: (item: HistoryGalleryItem) => void;
}) {
  const { items, onDownload, onSelect } = props;

  if (items.length === 0) {
    return (
      <section className="space-y-2.5 sm:space-y-3">
        <div>
          <div className="mb-2 flex items-center gap-2 sm:mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-malv-f-gold/14 ring-1 ring-malv-f-gold/18">
              <ImageIcon className="h-4 w-4 text-malv-f-gold" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-malv-f-gold sm:text-xs sm:tracking-widest">
              Your collection
            </span>
          </div>
          <h2 className="text-balance text-xl font-bold tracking-tight text-foreground min-[400px]:text-2xl sm:text-3xl">
            Recent creations
          </h2>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground sm:mt-3 sm:text-sm">
            Saved images appear here.
          </p>
        </div>
        <p className="rounded-2xl bg-muted/12 py-7 text-center text-[13px] text-muted-foreground sm:py-8 sm:text-sm">
          Nothing saved yet.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-2.5 sm:space-y-3">
      <div>
        <div className="mb-2 flex items-center gap-2 sm:mb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-malv-f-gold/14 ring-1 ring-malv-f-gold/18">
            <ImageIcon className="h-4 w-4 text-malv-f-gold" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-malv-f-gold sm:text-xs sm:tracking-widest">
            Your collection
          </span>
        </div>
        <h2 className="text-balance text-xl font-bold tracking-tight text-foreground min-[400px]:text-2xl sm:text-3xl">
          Recent creations
        </h2>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground sm:mt-3 sm:text-sm">
          Tap to reopen in the thread.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {items.map((image) => (
          <GalleryImageCard key={image.id} item={image} onDownload={onDownload} onOpen={onSelect} />
        ))}
      </div>
    </section>
  );
}

// ─── Exported shell ─────────────────────────────────────────────────────────

export type ExploreImageVercelShellProps = {
  prompt: string;
  setPrompt: (v: string) => void;
  placeholder: string;
  isGenerating: boolean;
  onSubmitPrompt: () => void;
  promptTextareaRef: RefObject<HTMLTextAreaElement | null>;
  error: string | null;
  /** Compact hint under the composer (e.g. upload / payload guidance) — not the main destructive error strip. */
  promptNotice?: string | null;
  transformCards: readonly ImageModeCard[];
  onPickMode: (card: ImageModeCard) => void;
  historyItems: HistoryGalleryItem[];
  onHistoryDownload: (imageUrl: string) => void;
  onHistorySelect: (item: HistoryGalleryItem) => void;
};

export function ExploreImageVercelShell(props: ExploreImageVercelShellProps) {
  const {
    prompt,
    setPrompt,
    placeholder,
    isGenerating,
    onSubmitPrompt,
    promptTextareaRef,
    error,
    promptNotice,
    transformCards,
    onPickMode,
    historyItems,
    onHistoryDownload,
    onHistorySelect
  } = props;

  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <main className="flex-1">
        <section className="bg-gradient-to-b from-card/80 to-background px-3 py-5 min-[400px]:px-4 sm:px-6 sm:py-8 lg:px-8 lg:py-9">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center">
              <div className="mb-2 inline-flex items-center gap-1 rounded-full border border-malv-f-gold/22 bg-malv-f-gold/[0.07] px-2.5 py-0.5 text-[10px] font-medium text-malv-f-gold sm:mb-2.5 sm:text-[11px]">
                <Sparkles className="h-3 w-3 shrink-0 opacity-90" />
                <span>Image studio</span>
              </div>
              <h1 className="text-balance px-0.5 text-[1.125rem] font-semibold leading-snug tracking-tight text-foreground min-[400px]:text-xl sm:px-0 sm:text-2xl sm:leading-tight lg:text-3xl">
                Describe it. Transform it.{" "}
                <span className="text-foreground/80">Keep the thread.</span>
              </h1>
              <p className="mx-auto mt-2 max-w-xl text-pretty text-[11px] leading-relaxed text-muted-foreground min-[400px]:text-[12px] sm:mt-3 sm:text-[13px]">
                Prompts and uploads in one visual thread.
              </p>
            </div>

            <div className="mt-4 sm:mt-6">
              <ExploreImagePromptComposer
                prompt={prompt}
                setPrompt={setPrompt}
                placeholder={placeholder}
                disabled={isGenerating}
                onSubmit={onSubmitPrompt}
                textareaRef={promptTextareaRef}
              />
              {promptNotice ? (
                <p
                  role="status"
                  className="mx-auto mt-2 max-w-lg px-1 text-center text-[11px] leading-relaxed text-[color:var(--malv-color-text-secondary)] min-[400px]:text-[12px]"
                >
                  {promptNotice}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-7xl space-y-10 px-3 py-8 min-[400px]:px-4 sm:space-y-16 sm:px-6 sm:py-16 lg:space-y-24 lg:px-8 lg:py-20">
          <motion.div {...SHELL.sectionMotion}>
            <ImageTransformCarouselRail
              cards={transformCards}
              disabled={isGenerating}
              onPickCard={onPickMode}
            />
          </motion.div>

          {error ? (
            <div className="rounded-xl border border-destructive/35 bg-destructive/10 px-3 py-2.5 text-[13px] text-destructive sm:text-sm">
              {error}
            </div>
          ) : null}

          <motion.div {...SHELL.sectionMotion}>
            <GallerySection items={historyItems} onDownload={onHistoryDownload} onSelect={onHistorySelect} />
          </motion.div>
        </div>
      </main>
    </div>
  );
}
