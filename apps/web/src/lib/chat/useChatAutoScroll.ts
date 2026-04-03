import { useCallback, useEffect, useRef } from "react";

const NEAR_BOTTOM_PX = 120;

export function useChatAutoScroll(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled !== false;
  const listRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  const isNearBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return true;
    const { scrollTop, scrollHeight, clientHeight } = el;
    return scrollHeight - scrollTop - clientHeight < NEAR_BOTTOM_PX;
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el || !enabled) return;
    const onScroll = () => {
      stickToBottomRef.current = isNearBottom();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [enabled, isNearBottom]);

  /** Call after user message or when stream ends — always scroll. */
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  /** During streaming — only if user was already near bottom. */
  const scrollIfStuck = useCallback((behavior: ScrollBehavior = "auto") => {
    if (!enabled) return;
    if (!stickToBottomRef.current && !isNearBottom()) return;
    scrollToBottom(behavior);
    stickToBottomRef.current = true;
  }, [enabled, isNearBottom, scrollToBottom]);

  return { listRef, scrollToBottom, scrollIfStuck, isNearBottom, stickToBottomRef };
}
