import { type PropsWithChildren } from "react";
import { cn } from "@/lib/cn";

type CallSafeAreaProps = PropsWithChildren<{
  className?: string;
}>;

export function CallSafeArea({ children, className }: CallSafeAreaProps) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-5xl flex-1 flex-col gap-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:gap-4",
        className
      )}
    >
      {children}
    </div>
  );
}
