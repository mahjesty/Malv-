import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const malvInputVariants = cva(
  "malv-f-motion flex h-10 w-full min-w-0 rounded-xl border border-[color:var(--malv-color-border-subtle)] bg-[rgb(var(--malv-f-surface-rgb))] px-3.5 text-sm text-malv-text shadow-[inset_0_1px_2px_rgb(0_0_0/0.12)] transition-[border-color,box-shadow,background-color] duration-200 ease-out placeholder:text-[color:var(--malv-color-text-placeholder)] focus-visible:outline-none focus-visible:border-malv-f-ring-live/40 focus-visible:ring-2 focus-visible:ring-malv-f-ring-live/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--malv-canvas-rgb))] disabled:pointer-events-none disabled:opacity-45 md:text-[0.8125rem]",
  {
    variants: {
      size: {
        md: "h-10",
        sm: "h-8 rounded-lg px-3 text-xs"
      }
    },
    defaultVariants: {
      size: "md"
    }
  }
);

export type MalvInputProps = React.ComponentProps<"input"> &
  VariantProps<typeof malvInputVariants>;

const MalvInput = React.forwardRef<HTMLInputElement, MalvInputProps>(
  function MalvInput({ className, type = "text", size, ...props }, ref) {
    return (
      <input
        ref={ref}
        type={type}
        data-malv-foundation="input"
        data-size={size ?? "md"}
        className={cn(malvInputVariants({ size }), className)}
        {...props}
      />
    );
  }
);

MalvInput.displayName = "MalvInput";

export { MalvInput, malvInputVariants };
