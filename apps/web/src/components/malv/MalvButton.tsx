import { cva, type VariantProps } from "class-variance-authority";
import { motion, useReducedMotion } from "motion/react";
import * as React from "react";

import { cn } from "@/lib/utils";
import {
  malvTapScale,
  malvTransition,
  malvHoverLiftY
} from "@/lib/malv-motion";

const malvButtonVariants = cva(
  "malv-f-motion relative inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border text-sm font-medium tracking-tight transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-malv-f-ring-live/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--malv-canvas-rgb))] disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "border-malv-f-live/25 bg-malv-f-live/15 text-malv-text shadow-[inset_0_1px_0_rgb(var(--malv-f-live-rgb)/0.1),0_0_22px_rgb(var(--malv-f-live-rgb)/0.08)] hover:border-malv-f-live/35 hover:bg-malv-f-live/22 hover:shadow-[inset_0_1px_0_rgb(var(--malv-f-live-rgb)/0.14),0_0_30px_rgb(var(--malv-f-live-rgb)/0.12)] active:bg-malv-f-live/12",
        secondary:
          "border-white/10 bg-surface-raised/80 text-malv-text shadow-sm hover:border-white/14 hover:bg-surface-overlay/90",
        ghost:
          "border-transparent bg-transparent text-malv-muted hover:border-white/8 hover:bg-white/[0.04] hover:text-malv-text",
        premium:
          "border-[color:var(--malv-color-gold-ring)] bg-gradient-to-b from-malv-f-gold/20 to-malv-f-gold/10 text-[rgb(245_240_232)] shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_0_24px_var(--malv-color-gold-glow)] hover:border-malv-f-gold/48 hover:from-malv-f-gold/26 hover:to-malv-f-gold/14"
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-4",
        lg: "h-10 px-5 text-[0.9375rem]"
      }
    },
    defaultVariants: {
      variant: "primary",
      size: "md"
    }
  }
);

export type MalvButtonProps = React.ComponentProps<typeof motion.button> &
  VariantProps<typeof malvButtonVariants>;

const MalvButton = React.forwardRef<HTMLButtonElement, MalvButtonProps>(
  function MalvButton(
    { className, variant, size, disabled, type = "button", ...props },
    ref
  ) {
    const reduceMotion = useReducedMotion();

    return (
      <motion.button
        ref={ref}
        type={type}
        disabled={disabled}
        data-malv-foundation="button"
        data-variant={variant ?? "primary"}
        whileHover={
          reduceMotion || disabled
            ? undefined
            : { y: malvHoverLiftY }
        }
        whileTap={
          reduceMotion || disabled ? undefined : { scale: malvTapScale }
        }
        transition={malvTransition}
        className={cn(malvButtonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);

MalvButton.displayName = "MalvButton";

export { MalvButton, malvButtonVariants };
