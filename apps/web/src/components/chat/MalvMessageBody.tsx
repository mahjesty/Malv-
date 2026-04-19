import { Fragment, useState } from "react";
import { Check, Copy } from "lucide-react";
import type { RichSurfaceStripTargets } from "@/lib/chat/malvRichResponsePresentation";
import {
  buildAssistantPresentationFenceSegments,
  classifyStreamingAssistantLine,
  type StreamingAssistantLine
} from "@/lib/chat/assistant-text";

async function copyToClipboard(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Fall back below
  }

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  ta.style.top = "-9999px";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(ta);
  }
}

function InlineText({ text }: { text: string }) {
  const boldParts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {boldParts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold text-malv-text">
              {part.slice(2, -2)}
            </strong>
          );
        }
        const codeParts = part.split(/(`[^`]+`)/g);
        return (
          <Fragment key={i}>
            {codeParts.map((bit, j) => {
              if (bit.startsWith("`") && bit.endsWith("`")) {
                return (
                  <code
                    key={j}
                    className="rounded-md bg-white/[0.08] px-1.5 py-0.5 font-mono text-[0.85em] text-malv-text/95"
                  >
                    {bit.slice(1, -1)}
                  </code>
                );
              }
              return bit ? <span key={j}>{bit}</span> : null;
            })}
          </Fragment>
        );
      })}
    </>
  );
}

const FENCED_CODE_SHELL =
  "my-2.5 overflow-hidden rounded-lg border border-white/[0.09] bg-black/35 backdrop-blur-sm sm:my-3 sm:rounded-xl";
const FENCED_CODE_PRE =
  "m-0 overflow-x-auto px-2.5 py-2.5 font-mono text-[11px] leading-relaxed text-malv-text/85 sm:px-3 sm:py-3 sm:text-[12px]";

/** Shared fenced ``` block: optional info line language + copy (streaming and final). */
function MalvAssistantFencedCodeBlock({ inner }: { inner: string }) {
  const [copied, setCopied] = useState(false);
  const normalized = inner.replace(/^\n/, "");
  const lines = normalized.split("\n");
  const maybeLang = lines[0]?.trim();
  const hasLang = Boolean(maybeLang && /^[\w-]+$/.test(maybeLang) && lines.length > 1);
  const code = hasLang ? lines.slice(1).join("\n") : normalized;

  async function onCopy() {
    await copyToClipboard(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1100);
  }

  return (
    <div className={FENCED_CODE_SHELL}>
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-2.5 py-1.5 sm:gap-3 sm:px-3 sm:py-2">
        <div className="min-w-0">
          {hasLang ? (
            <div className="truncate text-[10px] font-mono uppercase tracking-wider text-malv-text/45">{maybeLang}</div>
          ) : (
            <div className="text-[10px] font-mono uppercase tracking-wider text-malv-text/35">Code</div>
          )}
        </div>
        <button
          type="button"
          onClick={() => void onCopy()}
          className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[11px] font-semibold text-malv-text/75 transition-colors hover:bg-white/[0.06]"
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-malv-text/90" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className={FENCED_CODE_PRE}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** Shared outer shell so streaming → formatted completion does not jump horizontal bounds or type scale. */
const MESSAGE_BODY_SHELL_CLASS =
  "w-full max-w-[min(100%,760px)] text-[14px] leading-6 text-malv-text/[0.93] sm:text-[15px] sm:leading-7";

function renderStreamingAssistantLine(row: StreamingAssistantLine, lineKey: string, lineIdx: number) {
  if (row.kind === "heading") {
    if (!row.title) {
      return <div key={lineKey} className="h-1 shrink-0" aria-hidden />;
    }
    const sizeClass =
      row.level <= 1 ? "text-[15px] sm:text-[16px]" : row.level === 2 ? "text-[15px] sm:text-[15px]" : "text-[14px]";
    return (
      <div
        key={lineKey}
        className={`font-semibold tracking-tight text-malv-text ${sizeClass} ${lineIdx > 0 ? "pt-1" : ""}`}
      >
        <InlineText text={row.title} />
      </div>
    );
  }

  if (row.kind === "list_item") {
    return (
      <div key={lineKey} className="flex gap-2 pl-0.5 text-malv-text/[0.93] sm:pl-1">
        <span className="mt-0.5 shrink-0 select-none text-malv-text/45" aria-hidden>
          •
        </span>
        <div className="min-w-0 flex-1 whitespace-pre-wrap break-words">
          <InlineText text={row.text} />
        </div>
      </div>
    );
  }

  if (row.kind === "ordered_item") {
    return (
      <div key={lineKey} className="flex gap-2 pl-0.5 text-malv-text/[0.93] sm:pl-1">
        <span className="w-5 shrink-0 text-right tabular-nums text-[13px] text-malv-text/50 sm:w-6 sm:text-[14px]">
          {row.index}.
        </span>
        <div className="min-w-0 flex-1 whitespace-pre-wrap break-words">
          <InlineText text={row.text} />
        </div>
      </div>
    );
  }

  if (row.kind === "divider") {
    return <div key={lineKey} className="my-2 border-t border-white/[0.08]" aria-hidden />;
  }

  if (!row.text.length) {
    return null;
  }

  return (
    <div key={lineKey} className="whitespace-pre-wrap break-words text-malv-text/[0.93]">
      <InlineText text={row.text} />
    </div>
  );
}

function renderStructuredAssistantProseSegment(segText: string, segIdx: number) {
  const lines = segText.split("\n");
  return (
    <Fragment key={`p-${segIdx}`}>
      {lines.map((line, lineIdx) => {
        const row = classifyStreamingAssistantLine(line);
        const lineKey = `p-${segIdx}-l-${lineIdx}`;
        if (row.kind === "plain" && !row.text.length) {
          return lineIdx < lines.length - 1 ? (
            <div key={lineKey} className="h-1 shrink-0" aria-hidden />
          ) : null;
        }
        return renderStreamingAssistantLine(row, lineKey, lineIdx);
      })}
    </Fragment>
  );
}

/**
 * @deprecated Prefer {@link MalvMessageBody} with `streaming` — kept for call sites/tests.
 */
export function MalvStreamingPlainBody({ content }: { content: string }) {
  return <MalvMessageBody content={content} streaming emptyHint="…" />;
}

/**
 * Lightweight markdown-style rendering for MALV replies (paragraphs, lists, fenced + inline code).
 * No external markdown dependency.
 *
 * Rendering uses {@link buildAssistantPresentationFenceSegments} so live + settled share one normalization
 * and structure path (rich strip only when settled with targets).
 */
export function MalvMessageBody({
  content,
  emptyHint: _emptyHint,
  streaming,
  richSurfaceStrip
}: {
  content: string;
  emptyHint?: string;
  /** Live stream vs settled row — drives presentation phase (strip + structural parity). */
  streaming?: boolean;
  /** When set (structured capability surface), duplicate URLs are stripped from visible prose. */
  richSurfaceStrip?: RichSurfaceStripTargets | null;
}) {
  if (!content.length) return null;

  const fenceSegs = buildAssistantPresentationFenceSegments(content, {
    phase: streaming ? "live" : "settled",
    richSurfaceStrip: richSurfaceStrip ?? undefined
  });

  return (
    <div className={MESSAGE_BODY_SHELL_CLASS}>
      <div className="space-y-1">
        {fenceSegs.map((seg, segIdx) =>
          seg.kind === "code" ? (
            <MalvAssistantFencedCodeBlock key={`c-${segIdx}`} inner={seg.text} />
          ) : (
            renderStructuredAssistantProseSegment(seg.text, segIdx)
          )
        )}
      </div>
    </div>
  );
}
