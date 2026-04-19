import { createContext, useCallback, useContext, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

/**
 * Carries the operator's intent at the moment they triggered a runtime surface.
 * Additive — all fields optional. Deterministic-only; no model required.
 * MODEL INTEGRATION POINT: enrich `intent` with a model-generated string before
 * passing to `openRuntimeDrawer`. The drawer rendering requires no changes.
 */
export type RuntimeEntryContext = {
  /** Human-readable forward-looking intent shown immediately in the drawer header. */
  intent:       string;
  /** Machine-readable action that triggered the open. Stable identifier for future analytics/model seams. */
  sourceAction: "open_run" | "reschedule" | "open_in_chat" | string;
};

type MalvAppShellValue = {
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: Dispatch<SetStateAction<boolean>>;
  activeChatConversationId: string | null;
  setActiveChatConversationId: Dispatch<SetStateAction<string | null>>;
  /** Global runtime inspection drawer — single surface across Chat, Tasks, Inbox. */
  runtimeDrawerSessionId: string | null;
  runtimeDrawerConversationId: string | null;
  /** Optional task title shown in the drawer when opened from a task row */
  runtimeDrawerTaskTitle: string | null;
  /** Action-aware entry context — shown immediately while the session loads. */
  runtimeDrawerEntryContext: RuntimeEntryContext | null;
  openRuntimeDrawer: (args: { sessionId: string; conversationId?: string | null; taskTitle?: string | null; entryContext?: RuntimeEntryContext | null }) => void;
  closeRuntimeDrawer: () => void;
};

const MalvAppShellContext = createContext<MalvAppShellValue | null>(null);

export function MalvAppShellProvider(props: { children: ReactNode }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeChatConversationId, setActiveChatConversationId] = useState<string | null>(null);
  const [runtimeDrawerSessionId, setRuntimeDrawerSessionId] = useState<string | null>(null);
  const [runtimeDrawerConversationId, setRuntimeDrawerConversationId] = useState<string | null>(null);
  const [runtimeDrawerTaskTitle, setRuntimeDrawerTaskTitle] = useState<string | null>(null);
  const [runtimeDrawerEntryContext, setRuntimeDrawerEntryContext] = useState<RuntimeEntryContext | null>(null);

  const openRuntimeDrawer = useCallback((args: { sessionId: string; conversationId?: string | null; taskTitle?: string | null; entryContext?: RuntimeEntryContext | null }) => {
    const sid = args.sessionId.trim();
    if (!sid) return;
    setRuntimeDrawerSessionId(sid);
    setRuntimeDrawerConversationId(args.conversationId ?? null);
    setRuntimeDrawerTaskTitle(args.taskTitle ?? null);
    setRuntimeDrawerEntryContext(args.entryContext ?? null);
  }, []);

  const closeRuntimeDrawer = useCallback(() => {
    setRuntimeDrawerSessionId(null);
    setRuntimeDrawerConversationId(null);
    setRuntimeDrawerTaskTitle(null);
    setRuntimeDrawerEntryContext(null);
  }, []);

  const value = useMemo(
    () => ({
      mobileSidebarOpen,
      setMobileSidebarOpen,
      activeChatConversationId,
      setActiveChatConversationId,
      runtimeDrawerSessionId,
      runtimeDrawerConversationId,
      runtimeDrawerTaskTitle,
      runtimeDrawerEntryContext,
      openRuntimeDrawer,
      closeRuntimeDrawer
    }),
    [
      mobileSidebarOpen,
      activeChatConversationId,
      runtimeDrawerSessionId,
      runtimeDrawerConversationId,
      runtimeDrawerTaskTitle,
      runtimeDrawerEntryContext,
      openRuntimeDrawer,
      closeRuntimeDrawer
    ]
  );

  return <MalvAppShellContext.Provider value={value}>{props.children}</MalvAppShellContext.Provider>;
}

export function useMalvAppShell() {
  const v = useContext(MalvAppShellContext);
  if (!v) throw new Error("useMalvAppShell must be used within MalvAppShellProvider");
  return v;
}

export function useMalvAppShellOptional() {
  return useContext(MalvAppShellContext);
}
