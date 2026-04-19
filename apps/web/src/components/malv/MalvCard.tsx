import { cva, type VariantProps } from "class-variance-authority";
import { motion, useReducedMotion } from "motion/react";
import * as React from "react";

import { cn } from "@/lib/utils";
import {
  malvCardHoverLiftY,
  malvTapScale,
  malvTransition,
  malvRevealHidden,
  malvRevealVisible
} from "@/lib/malv-motion";

const malvCardVariants = cva(
  "malv-f-motion rounded-[var(--malv-f-card-radius,1rem)] border border-[color:var(--malv-color-border-subtle)] bg-[rgb(var(--malv-f-surface-rgb))] text-malv-text shadow-[0_1px_0_rgb(255_255_255/0.04)_inset] transition-[border-color,box-shadow,background-color] duration-200 ease-out",
  {
    variants: {
      variant: {
        default: "",
        elevated:
          "shadow-[0_18px_48px_-28px_rgb(0_0_0/0.55),0_1px_0_rgb(255_255_255/0.05)_inset]",
        interactive: "cursor-pointer"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export type MalvCardProps = React.ComponentProps<typeof motion.div> &
  VariantProps<typeof malvCardVariants> & {
    /** Soft entrance — off by default to avoid surprising layout shifts */
    reveal?: boolean;
  };

const MalvCard = React.forwardRef<HTMLDivElement, MalvCardProps>(
  function MalvCard(
    { className, variant, reveal = false, children, ...props },
    ref
  ) {
    const reduceMotion = useReducedMotion();
    const interactive = variant === "interactive";

    return (
      <motion.div
        ref={ref}
        data-malv-foundation="card"
        data-variant={variant ?? "default"}
        initial={reveal && !reduceMotion ? malvRevealHidden : false}
        animate={reveal && !reduceMotion ? malvRevealVisible : undefined}
        whileHover={
          reduceMotion || !interactive
            ? undefined
            : {
                y: malvCardHoverLiftY,
                borderColor: "var(--malv-color-border-strong)",
                boxShadow:
                  "0 22px 56px -32px rgb(0 0 0 / 0.55), inset 0 1px 0 rgb(255 255 255 / 0.06), 0 0 32px var(--malv-color-live-glow)"
              }
        }
        whileTap={
          reduceMotion || !interactive ? undefined : { scale: malvTapScale }
        }
        transition={malvTransition}
        className={cn(malvCardVariants({ variant }), className)}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);

MalvCard.displayName = "MalvCard";

export { MalvCard, malvCardVariants };
