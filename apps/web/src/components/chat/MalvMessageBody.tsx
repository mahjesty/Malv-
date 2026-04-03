import { Fragment, useState } from "react";
import { Check, Copy } from "lucide-react";

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

function ProseBlock({ block }: { block: string }) {
  const lines = block.split("\n");
  const listLines = lines.filter((l) => l.trim());
  const isList = listLines.length > 0 && listLines.every((l) => /^[\s]*[-*]\s/.test(l));

  if (isList) {
    return (
      <ul className="my-2.5 list-disc space-y-1 pl-4 first:mt-0 sm:my-3 sm:space-y-1.5 sm:pl-5">
        {listLines.map((l, i) => (
          <li key={i} className="text-[14px] leading-6 text-malv-text/[0.93] sm:text-[15px] sm:leading-7">
            <InlineText text={l.replace(/^[\s]*[-*]\s/, "")} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <p className="my-2.5 text-[14px] leading-6 text-malv-text/[0.93] first:mt-0 sm:my-3 sm:text-[15px] sm:leading-7 sm:text-malv-text/[0.94]">
      <InlineText text={block} />
    </p>
  );
}

/**
 * Lightweight markdown-style rendering for MALV replies (paragraphs, lists, fenced + inline code).
 * No external markdown dependency — safe for streaming partial content.
 */
export function MalvMessageBody({ content, emptyHint }: { content: string; emptyHint?: string }) {
  if (!content.trim()) {
    return <span className="text-[13px] italic text-malv-text/55 sm:text-sm">{emptyHint ?? "…"}</span>;
  }

  const segments = content.split("```");
  const [copiedBlockKey, setCopiedBlockKey] = useState<string | null>(null);

  async function onCopyBlock(key: string, code: string) {
    await copyToClipboard(code);
    setCopiedBlockKey(key);
    // Premium-feeling: short feedback, then revert.
    window.setTimeout(() => {
      setCopiedBlockKey((prev) => (prev === key ? null : prev));
    }, 1100);
  }

  return (
    <div className="w-full max-w-[min(100%,760px)] text-[14px] leading-6 text-malv-text/[0.93] sm:text-[15px] sm:leading-7">
      {segments.map((seg, i) => {
        if (i % 2 === 1) {
          const lines = seg.replace(/^\n/, "").split("\n");
          const maybeLang = lines[0]?.trim();
          const hasLang = maybeLang && /^[\w-]+$/.test(maybeLang) && lines.length > 1;
          const code = hasLang ? lines.slice(1).join("\n") : seg.replace(/^\n/, "");
          const key = `${i}-${hasLang ? maybeLang : "code"}`;
          const copied = copiedBlockKey === key;
          return (
            <div
              key={i}
              className="my-2.5 overflow-hidden rounded-lg border border-white/[0.09] bg-black/35 backdrop-blur-sm sm:my-3 sm:rounded-xl"
            >
              <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-2.5 py-1.5 sm:gap-3 sm:px-3 sm:py-2">
                <div className="min-w-0">
                  {hasLang ? (
                    <div className="truncate text-[10px] font-mono uppercase tracking-wider text-malv-text/45">
                      {maybeLang}
                    </div>
                  ) : (
                    <div className="text-[10px] font-mono uppercase tracking-wider text-malv-text/35">Code</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void onCopyBlock(key, code)}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[11px] font-semibold text-malv-text/75 transition-colors hover:bg-white/[0.06]"
                  aria-label={copied ? "Copied" : "Copy code"}
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-malv-text/90" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
              </div>
              <pre className="m-0 overflow-x-auto px-2.5 py-2.5 font-mono text-[11px] leading-relaxed text-malv-text/85 sm:px-3 sm:py-3 sm:text-[12px]">
                <code>{code}</code>
              </pre>
            </div>
          );
        }

        const blocks = seg.split(/\n\n+/);
        return (
          <Fragment key={i}>
            {blocks.map((b, j) => (
              <ProseBlock key={`${i}-${j}`} block={b} />
            ))}
          </Fragment>
        );
      })}
    </div>
  );
}
