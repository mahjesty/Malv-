const VIDEO_CHAT_CONTEXT_PREFIX = "malv.video.chatctx.";

export type VideoTimelineSegment = {
  label: string;
  tStartSec: number;
  tEndSec: number;
  explanation?: string;
  keyObservations?: string[];
  keyActions?: string[];
  warnings?: string[];
  confidence?: "low" | "medium" | "high";
  visualSummary?: string;
  uiElements?: string[];
  visibleErrors?: string[];
  thumbnailDataUrl?: string;
};

export type VideoChatContextPayload = {
  fileId: string;
  fileName: string;
  durationSec?: number;
  width?: number;
  height?: number;
  timeline: VideoTimelineSegment[];
  selectedSegment?: VideoTimelineSegment | null;
};

function storageKey(id: string) {
  return `${VIDEO_CHAT_CONTEXT_PREFIX}${id}`;
}

export function saveVideoChatContext(payload: VideoChatContextPayload): string {
  const id = crypto.randomUUID();
  window.sessionStorage.setItem(storageKey(id), JSON.stringify(payload));
  return id;
}

export function loadVideoChatContext(id: string): VideoChatContextPayload | null {
  const raw = window.sessionStorage.getItem(storageKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VideoChatContextPayload;
  } catch {
    return null;
  }
}

export function clearVideoChatContext(id: string) {
  window.sessionStorage.removeItem(storageKey(id));
}

