import type { ReactNode } from "react";

type Tone = "info" | "error" | "success";

const tones: Record<Tone, string> = {
  info: "border-accent-cyan/40 bg-accent-cyan/12 text-cyan-50",
  error: "border-red-400/45 bg-red-500/14 text-red-50",
  success: "border-emerald-400/40 bg-emerald-500/14 text-emerald-50"
};

export function AlertBanner(props: {
  tone?: Tone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const tone = props.tone ?? "info";
  return (
    <div className={["rounded-2xl border px-4 py-3", tones[tone]].join(" ")}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold">{props.title}</div>
          {props.children ? <div className="text-sm text-malv-muted mt-1 leading-relaxed">{props.children}</div> : null}
        </div>
        {props.action ? <div className="shrink-0">{props.action}</div> : null}
      </div>
    </div>
  );
}
