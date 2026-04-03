import type { ChatAttachmentRef, MalvChatMessage } from "./types";

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let u = 0;
  let n = bytes;
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024;
    u++;
  }
  const digits = u === 0 ? 0 : n < 10 ? 1 : n < 100 ? 1 : 0;
  return `${n.toFixed(digits)} ${units[u]}`;
}

export function attachmentKindFromFile(file: File): ChatAttachmentRef["kind"] {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "voice";
  if (file.type.startsWith("video/")) return "video_session";
  return "file";
}

/** Legacy composer injected `[Attached: …]` into message body — strip for display / editing. */
const LEGACY_ATTACHED_RE = /^\[Attached:\s*[^\]]*\]\s*\n*/;

export function stripLegacyAttachmentPrefix(content: string): string {
  let c = content;
  let guard = 0;
  while (LEGACY_ATTACHED_RE.test(c) && guard++ < 4) {
    c = c.replace(LEGACY_ATTACHED_RE, "");
  }
  return c.replace(/^\n+/, "");
}

export function collectBlobUrlsFromMessages(messages: MalvChatMessage[]): Set<string> {
  const s = new Set<string>();
  for (const m of messages) {
    for (const a of m.attachments ?? []) {
      if (a.url?.startsWith("blob:")) s.add(a.url);
    }
  }
  return s;
}

/** Deep-enough copy so composer drafts and message rows never share mutable attachment objects. */
export function cloneChatAttachmentRef(a: ChatAttachmentRef): ChatAttachmentRef {
  return {
    ...a,
    metadata: a.metadata ? { ...a.metadata } : undefined
  };
}

export function cloneChatAttachmentRefs(attachments: ChatAttachmentRef[] | undefined): ChatAttachmentRef[] {
  return (attachments ?? []).map(cloneChatAttachmentRef);
}

/**
 * Text sent to the orchestration layer. Keeps filenames/types for context without duplicating UI attachment chrome.
 */
export function buildBackendUserMessageText(userText: string, attachments: ChatAttachmentRef[] | undefined): string {
  const att = attachments ?? [];
  const lines: string[] = [];
  if (att.length) {
    lines.push("The user attached the following (reference names and types):");
    for (const a of att) {
      const mime = typeof a.metadata?.mimeType === "string" ? a.metadata.mimeType : "unknown";
      const sizeBytes = a.metadata?.sizeBytes;
      const size =
        typeof sizeBytes === "number" && Number.isFinite(sizeBytes) ? formatFileSize(sizeBytes) : "";
      const label = a.label ?? "attachment";
      lines.push(`- ${a.kind}: ${label} (${mime})${size ? ` · ${size}` : ""}`);
    }
    lines.push("");
  }
  const body = userText.trim();
  if (body) lines.push(body);
  return lines.join("\n").trim();
}
