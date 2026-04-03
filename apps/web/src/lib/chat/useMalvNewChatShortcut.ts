import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

function targetIsTextInput(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Desktop: Cmd+Shift+O (macOS) / Ctrl+Shift+O (Windows/Linux) → fresh chat (`?fresh=1`).
 * Skips when focus is in an editable field so typing shortcuts are not hijacked.
 */
export function useMalvNewChatShortcut() {
  const navigate = useNavigate();
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.shiftKey) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.code !== "KeyO") return;
      if (targetIsTextInput(e.target)) return;
      e.preventDefault();
      navigate("/app/chat?fresh=1", { replace: true });
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [navigate]);
}
