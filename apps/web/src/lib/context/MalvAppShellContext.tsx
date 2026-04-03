import { createContext, useCallback, useContext, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

type MalvAppShellValue = {
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: Dispatch<SetStateAction<boolean>>;
  activeChatConversationId: string | null;
  setActiveChatConversationId: Dispatch<SetStateAction<string | null>>;
  /** Global runtime inspection drawer — single surface across Chat, Tasks, Inbox. */
  runtimeDrawerSessionId: string | null;
  runtimeDrawerConversationId: string | null;
  openRuntimeDrawer: (args: { sessionId: string; conversationId?: string | null }) => void;
  closeRuntimeDrawer: () => void;
};

const MalvAppShellContext = createContext<MalvAppShellValue | null>(null);

export function MalvAppShellProvider(props: { children: ReactNode }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeChatConversationId, setActiveChatConversationId] = useState<string | null>(null);
  const [runtimeDrawerSessionId, setRuntimeDrawerSessionId] = useState<string | null>(null);
  const [runtimeDrawerConversationId, setRuntimeDrawerConversationId] = useState<string | null>(null);

  const openRuntimeDrawer = useCallback((args: { sessionId: string; conversationId?: string | null }) => {
    const sid = args.sessionId.trim();
    if (!sid) return;
    setRuntimeDrawerSessionId(sid);
    setRuntimeDrawerConversationId(args.conversationId ?? null);
  }, []);

  const closeRuntimeDrawer = useCallback(() => {
    setRuntimeDrawerSessionId(null);
    setRuntimeDrawerConversationId(null);
  }, []);

  const value = useMemo(
    () => ({
      mobileSidebarOpen,
      setMobileSidebarOpen,
      activeChatConversationId,
      setActiveChatConversationId,
      runtimeDrawerSessionId,
      runtimeDrawerConversationId,
      openRuntimeDrawer,
      closeRuntimeDrawer
    }),
    [
      mobileSidebarOpen,
      activeChatConversationId,
      runtimeDrawerSessionId,
      runtimeDrawerConversationId,
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
