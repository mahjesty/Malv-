import React from "react";

export function Input(props: {
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  type?: "text" | "password" | "email";
  className?: string;
  disabled?: boolean;
  error?: string;
  iconLeft?: React.ReactNode;
  id?: string;
  "aria-invalid"?: boolean;
}) {
  const err = Boolean(props.error);
  return (
    <div className="w-full">
      <div
        className={[
          "flex items-stretch rounded-xl border bg-surface-base transition-all duration-200",
          "focus-within:ring-2 focus-within:ring-brand/45 focus-within:border-brand/50",
          err ? "border-red-400/55 focus-within:ring-red-400/35" : "border-white/[0.12] hover:border-white/[0.18]"
        ].join(" ")}
      >
        {props.iconLeft ? (
          <span className="pl-3 flex items-center text-malv-muted shrink-0">{props.iconLeft}</span>
        ) : null}
        <input
          id={props.id}
          value={props.value ?? ""}
          onChange={(e) => props.onChange?.(e.target.value)}
          placeholder={props.placeholder}
          type={props.type ?? "text"}
          disabled={props.disabled}
          aria-invalid={props["aria-invalid"] ?? err}
          className={[
            "flex-1 min-w-0 rounded-xl bg-transparent px-4 py-3 text-sm text-malv-text placeholder:text-malv-muted/80",
            "focus:outline-none disabled:opacity-50",
            props.iconLeft ? "pl-2" : "",
            props.className
          ].filter(Boolean).join(" ")}
        />
      </div>
      {props.error ? <p className="mt-1.5 text-xs text-red-300/95">{props.error}</p> : null}
    </div>
  );
}
