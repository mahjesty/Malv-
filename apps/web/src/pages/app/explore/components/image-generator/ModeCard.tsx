import { ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";
import { launchBehaviorActionLabel, type ImageModeCard } from "./constants";
import { malvModeCardVisuals } from "./malv-mode-card-visual.util";

type Props = {
  card: ImageModeCard;
  disabled?: boolean;
  onLaunch: (card: ImageModeCard) => void;
  compact?: boolean;
  /** Slightly smaller rail cards for dense layouts */
  dense?: boolean;
};

export function ModeCard({ card, disabled = false, onLaunch, compact = false, dense = false }: Props) {
  const density = compact || dense ? "compact" : "rail";
  const { gradientClass, glowClass } = malvModeCardVisuals(card.id, density);
  const actionLabel = `${launchBehaviorActionLabel(card.launchBehavior)} \u2192`;
  const minW = dense
    ? "min-w-[min(40vw,138px)] min-[400px]:min-w-[min(42vw,150px)] sm:min-w-[200px]"
    : compact
      ? "min-w-[220px]"
      : "min-w-[248px]";
  const h = dense ? "h-[168px] min-[400px]:h-[180px] sm:h-[248px]" : compact ? "h-[286px]" : "h-[322px]";
  const radius = dense ? "rounded-[12px] sm:rounded-[18px]" : "rounded-[22px]";
  const hoverScale = dense ? 1.02 : compact ? 1.02 : 1.04;
  const shadow = dense
    ? "shadow-[0_14px_36px_rgba(0,0,0,0.42)]"
    : "shadow-[0_18px_44px_rgba(0,0,0,0.46)]";

  return (
    <motion.article
      whileHover={{ y: dense ? -3 : -5, scale: hoverScale }}
      transition={{ duration: 0.24, ease: "easeOut" }}
      className={[
        "group snap-start overflow-hidden bg-card/90 shadow-md shadow-black/35 transition-all duration-300 hover:shadow-lg hover:shadow-black/45",
        shadow,
        radius,
        minW,
        glowClass
      ].join(" ")}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => onLaunch(card)}
        className={["relative block w-full overflow-hidden text-left", h].join(" ")}
      >
        <div
          className={[
            "absolute inset-0"
          ].join(" ")}
        >
          <img
            src={card.previewImage}
            alt={card.title}
            className="h-full w-full object-cover opacity-[0.98] saturate-[1.1] transition duration-500 group-hover:scale-[1.08]"
          />
          <div className={`absolute inset-0 bg-gradient-to-tr ${gradientClass}`} />
          <div className="absolute inset-0 bg-gradient-to-t from-[rgb(var(--malv-surface-void-rgb)/0.94)] via-[rgb(var(--malv-surface-base-rgb)/0.38)] to-transparent" />
          <div
            className={
              dense ? "absolute inset-x-0 bottom-0 p-1.5 min-[400px]:p-2 sm:p-3" : "absolute inset-x-0 bottom-0 p-4"
            }
          >
            <p
              className={
                dense
                  ? "text-[11px] font-semibold leading-tight tracking-[-0.01em] text-white min-[400px]:text-[12px] sm:text-[14px]"
                  : "text-[16px] font-semibold tracking-[-0.01em] text-white"
              }
            >
              {card.title}
            </p>
          </div>
          <div className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/44 px-2.5 py-1 text-[10px] font-medium text-white/88 opacity-0 transition duration-300 group-hover:opacity-100">
            {actionLabel}
            <ArrowUpRight className="h-3 w-3" />
          </div>
        </div>
      </button>
    </motion.article>
  );
}
