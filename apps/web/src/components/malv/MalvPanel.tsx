import { cva, type VariantProps } from "class-variance-authority";
import { motion, useReducedMotion } from "motion/react";
import * as React from "react";

import { cn } from "@/lib/utils";
import { malvRevealHidden, malvRevealVisible, malvTransition } from "@/lib/malv-motion";

const malvPanelVariants = cva(
  "malv-f-motion rounded-[var(--malv-f-panel-radius,1.25rem)] border border-[color:var(--malv-color-border-subtle)] bg-[rgb(var(--malv-f-surface-hi-rgb))] text-malv-text shadow-[0_20px_56px_-36px_rgb(0_0_0/0.55),0_1px_0_rgb(255_255_255/0.035)_inset] transition-[border-color,box-shadow] duration-200 ease-out",
  {
    variants: {
      padding: {
        none: "",
        comfortable: "p-4 sm:p-5",
        dense: "p-3 sm:p-4"
      },
      tone: {
        default: "",
        /** Slight live wash — sidebars, active work */
        live:
          "border-malv-f-live/20 shadow-[0_20px_56px_-36px_rgb(0_0_0/0.55),0_1px_0_rgb(255_255_255/0.04)_inset] ring-1 ring-malv-f-live/10"
      }
    },
    defaultVariants: {
      padding: "comfortable",
      tone: "default"
    }
  }
);

export type MalvPanelProps = React.ComponentProps<typeof motion.div> &
  VariantProps<typeof malvPanelVariants> & {
    reveal?: boolean;
  };

const MalvPanel = React.forwardRef<HTMLDivElement, MalvPanelProps>(
  function MalvPanel(
    {
      className,
      padding,
      tone,
      reveal = false,
      children,
      ...props
    },
    ref
  ) {
    const reduceMotion = useReducedMotion();

    return (
      <motion.div
        ref={ref}
        data-malv-foundation="panel"
        initial={reveal && !reduceMotion ? malvRevealHidden : false}
        animate={reveal && !reduceMotion ? malvRevealVisible : undefined}
        transition={malvTransition}
        className={cn(malvPanelVariants({ padding, tone }), className)}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);

MalvPanel.displayName = "MalvPanel";

export { MalvPanel, malvPanelVariants };
