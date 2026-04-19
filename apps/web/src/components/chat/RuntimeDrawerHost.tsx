import { useNavigate, useLocation } from "react-router-dom";
import { useMalvAppShell } from "../../lib/context/MalvAppShellContext";
import { RuntimeDrawer } from "./RuntimeDrawer";

/** Single app-wide runtime panel — closes and strips `?runtimeSessionId=` when present. */
export function RuntimeDrawerHost() {
  const { runtimeDrawerSessionId, runtimeDrawerConversationId, runtimeDrawerTaskTitle, runtimeDrawerEntryContext, closeRuntimeDrawer } = useMalvAppShell();
  const navigate = useNavigate();
  const location = useLocation();

  const onClose = () => {
    closeRuntimeDrawer();
    const sp = new URLSearchParams(location.search);
    if (sp.has("runtimeSessionId")) {
      sp.delete("runtimeSessionId");
      const next = sp.toString();
      navigate({ pathname: location.pathname, search: next ? `?${next}` : "" }, { replace: true });
    }
  };

  // closeDrawerState — clears context only, no URL navigation.
  // Used by the footer when it's already navigating to chat (to avoid double-navigate conflict).
  const closeDrawerState = () => {
    closeRuntimeDrawer();
  };

  return (
    <RuntimeDrawer
      open={runtimeDrawerSessionId != null}
      sessionId={runtimeDrawerSessionId}
      conversationId={runtimeDrawerConversationId}
      taskTitle={runtimeDrawerTaskTitle}
      entryContext={runtimeDrawerEntryContext}
      onClose={onClose}
      closeDrawerState={closeDrawerState}
    />
  );
}
