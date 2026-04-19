import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import {
  BarChart3,
  Bot,
  Search,
  LogOut,
  MoreHorizontal,
  Pin,
  Plus,
  Settings,
  Sparkles,
  UsersRound,
  X,
  ListChecks,
  Inbox,
  Compass,
  type LucideIcon
} from "lucide-react";
import { ConversationSessionMenu, type SessionMenuActionId } from "./ConversationSessionMenu";
import {
  deleteConversation,
  duplicateConversation,
  fetchConversationDetail,
  fetchConversations,
  renameConversation
} from "../../lib/api/dataPlane";
import {
  buildConversationExtractiveDigest,
  buildConversationMarkdownExport,
  downloadTextFile
} from "../../lib/conversationExport";
import {
  addConversationTag,
  CONVERSATION_PREFS_STORAGE_KEYS,
  getConversationTags,
  getPinnedConversationIds,
  isConversationPinned,
  subscribeConversationPrefs,
  togglePinConversation
} from "../../lib/conversationSessionPrefs";
import { parseNestErrorMessage } from "../../lib/api/http-core";
import { useAuth } from "../../lib/auth/AuthContext";
import { parseAccessTokenPayload } from "../../lib/auth/jwtPayload";
import { useMalvAppShellOptional } from "../../lib/context/MalvAppShellContext";

type MenuDef = { to: string; label: string; icon: LucideIcon; end?: boolean };

const DESKTOP_MIN_WIDTH_PX = 1024;
const DESKTOP_MEDIA_QUERY = `(min-width: ${DESKTOP_MIN_WIDTH_PX}px)`;

function subscribeDesktopLayouts(callback: () => void) {
  const mq = window.matchMedia(DESKTOP_MEDIA_QUERY);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getDesktopLayoutSnapshot() {
  return window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
}

function getServerDesktopLayoutSnapshot() {
  return false;
}

function useIsDesktopLayout() {
  return useSyncExternalStore(subscribeDesktopLayouts, getDesktopLayoutSnapshot, getServerDesktopLayoutSnapshot);
}

function PortalLayer(props: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(props.children, document.body);
}

function buildMenu(showAdmin: boolean): MenuDef[] {
  const base: MenuDef[] = [
    { to: "/app/tasks", label: "Tasks", icon: ListChecks },
    { to: "/app/inbox", label: "Inbox", icon: Inbox },
    { to: "/app/explore", label: "Explore", icon: Compass },
    { to: "/app/studio", label: "Studio", icon: Sparkles },
    { to: "/app/collaboration", label: "Collaboration", icon: UsersRound }
  ];
  if (showAdmin) {
    base.push(
      { to: "/app/admin", label: "Admin", icon: BarChart3 },
      { to: "/app/admin/self-upgrade", label: "Self-upgrade", icon: Bot }
    );
  }
  return base;
}

function pickFirstString(...values: Array<unknown>) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function isLikelyInternalId(value: string | null | undefined) {
  if (!value) return false;
  const v = value.trim();
  if (!v) return false;
  // UUIDs or opaque id-like tokens should not be the visible profile label.
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(v)) return true;
  return /^[a-z0-9_-]{20,}$/i.test(v);
}

/** App shell sidebar — session history always visible, profile card opens account menu. */
export default function AppSidebar(props: { showAdmin: boolean }) {
  const { accessToken, email: authEmail, displayName: authDisplayName, logout } = useAuth();
  const token = accessToken ?? undefined;
  const location = useLocation();
  const navigate = useNavigate();
  const isDesktopLayout = useIsDesktopLayout();
  const shell = useMalvAppShellOptional();
  const mobileOpen = shell?.mobileSidebarOpen ?? false;
  const setMobileOpen = shell?.setMobileSidebarOpen;
  const menu = useMemo(() => buildMenu(props.showAdmin), [props.showAdmin]);

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileCardRef = useRef<HTMLDivElement | null>(null);

  const newChatShortcutHint =
    typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/i.test(navigator.platform) ? "⌘⇧O" : "Ctrl+Shift+O";

  const queryClient = useQueryClient();

  const sidebarMaxVisible = 30;
  const searchPageSize = 25;

  const {
    data: convData,
    isLoading: convLoading,
    isError: convError,
    error: convQueryError,
    refetch: refetchConversations
  } = useQuery({
    queryKey: ["conversations", "sidebar"],
    queryFn: () => fetchConversations(token!, { limit: 100, offset: 0 }),
    enabled: Boolean(token),
    retry: 2,
    refetchOnWindowFocus: true
  });

  type ConvRow = { id: string; title: string; updatedAtMs: number; href: string };

  const recentRows = useMemo<ConvRow[]>(() => {
    const items = convData?.items ?? [];
    return items
      .map((c) => {
        const updatedAtMs = new Date(c.updatedAt).getTime();
        return {
          id: c.id,
          title: c.title?.trim() || "Untitled session",
          updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : 0,
          href: `/app/chat?conversationId=${encodeURIComponent(c.id)}`
        };
      })
      .sort((a, b) => (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0));
  }, [convData]);

  const sessionPrefsSnapshot = useSyncExternalStore(
    subscribeConversationPrefs,
    () => {
      try {
        return (
          (window.localStorage.getItem(CONVERSATION_PREFS_STORAGE_KEYS.pins) ?? "") +
          (window.localStorage.getItem(CONVERSATION_PREFS_STORAGE_KEYS.tags) ?? "")
        );
      } catch {
        return "";
      }
    },
    () => ""
  );

  const orderedRecentRows = useMemo(() => {
    const pins = getPinnedConversationIds();
    const pinSet = new Set(pins);
    const pinned: ConvRow[] = [];
    for (const id of pins) {
      const row = recentRows.find((r) => r.id === id);
      if (row) pinned.push(row);
    }
    const rest = recentRows.filter((r) => !pinSet.has(r.id));
    return [...pinned, ...rest];
  }, [recentRows, sessionPrefsSnapshot]);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [allRowsForSearch, setAllRowsForSearch] = useState<ConvRow[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchPage, setSearchPage] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 200);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  const mapAllConversationsToRows = useCallback(
    (items: Array<{ id: string; title: string | null; updatedAt: string }>) =>
      items
        .map((c) => {
          const updatedAtMs = new Date(c.updatedAt).getTime();
          return {
            id: c.id,
            title: c.title?.trim() || "Untitled session",
            updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : 0,
            href: `/app/chat?conversationId=${encodeURIComponent(c.id)}`
          };
        })
        .sort((a, b) => (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0)),
    []
  );

  const loadAllForSearch = useCallback(async () => {
    if (!token) return;
    setSearchLoading(true);
    try {
      const pageSize = 100;
      let offset = 0;
      const out: ConvRow[] = [];
      while (true) {
        const res = await fetchConversations(token, { limit: pageSize, offset });
        out.push(...mapAllConversationsToRows(res.items).slice(0));
        offset += pageSize;
        if (offset >= res.total) break;
      }
      setAllRowsForSearch(out);
    } finally {
      setSearchLoading(false);
    }
  }, [mapAllConversationsToRows, token]);

  useEffect(() => {
    const q = debouncedSearchQuery.trim();
    setSearchPage(0);
    if (!q) return;
    if (allRowsForSearch) return;
    void loadAllForSearch();
  }, [allRowsForSearch, debouncedSearchQuery, loadAllForSearch]);

  const recentSessions = useMemo(() => orderedRecentRows.slice(0, sidebarMaxVisible), [orderedRecentRows, sidebarMaxVisible]);

  const searchMatches = useMemo(() => {
    const q = debouncedSearchQuery.trim().toLowerCase();
    if (!q) return [];
    if (!allRowsForSearch) return [];
    return allRowsForSearch.filter((r) => r.title.toLowerCase().includes(q));
  }, [allRowsForSearch, debouncedSearchQuery]);

  const searchMatchesOrdered = useMemo(() => {
    const pins = getPinnedConversationIds();
    const pinSet = new Set(pins);
    const pinned: ConvRow[] = [];
    for (const id of pins) {
      const row = searchMatches.find((r) => r.id === id);
      if (row) pinned.push(row);
    }
    const rest = searchMatches.filter((r) => !pinSet.has(r.id));
    return [...pinned, ...rest];
  }, [searchMatches, sessionPrefsSnapshot]);

  const searchResults = useMemo(() => {
    if (!searchMatchesOrdered.length) return [];
    const start = searchPage * searchPageSize;
    const end = start + searchPageSize;
    return searchMatchesOrdered.slice(start, end);
  }, [searchMatchesOrdered, searchPage]);

  const hasSearchNextPage = searchMatchesOrdered.length > (searchPage + 1) * searchPageSize;

  const [menuOpenForId, setMenuOpenForId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | { type: "rename" | "delete"; id: string }>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [digestDialog, setDigestDialog] = useState<{ title: string; text: string } | null>(null);
  const [tagDialog, setTagDialog] = useState<{ row: ConvRow; draft: string } | null>(null);

  useEffect(() => {
    if (!toastMsg) return;
    const t = window.setTimeout(() => setToastMsg(null), 3200);
    return () => window.clearTimeout(t);
  }, [toastMsg]);

  useEffect(() => {
    if (!dialog || dialog.type !== "rename") return;
    const t = window.setTimeout(() => renameInputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [dialog]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      const root = profileCardRef.current;
      if (root && root.contains(t)) return;
      setProfileMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown, { capture: true });
    return () => document.removeEventListener("pointerdown", onDown, { capture: true });
  }, [profileMenuOpen]);

  useEffect(() => {
    if (!menuOpenForId) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      const root = document.getElementById(`conv-menu-${menuOpenForId}`);
      if (!root) return setMenuOpenForId(null);
      if (root.contains(t)) return;
      if ((e.target as Element | null)?.closest?.("[data-malv-session-menu]")) return;
      setMenuOpenForId(null);
    };
    document.addEventListener("pointerdown", onDown, { capture: true });
    return () => document.removeEventListener("pointerdown", onDown, { capture: true });
  }, [menuOpenForId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (dialog) return setDialog(null);
      if (digestDialog) return setDigestDialog(null);
      if (tagDialog) return setTagDialog(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialog, digestDialog, tagDialog]);

  const openRename = useCallback(
    (row: ConvRow) => {
      setMenuOpenForId(null);
      setDialog({ type: "rename", id: row.id });
      setRenameDraft(row.title);
    },
    []
  );

  const openDelete = useCallback((row: ConvRow) => {
    setMenuOpenForId(null);
    setDialog({ type: "delete", id: row.id });
  }, []);

  const handleSessionAction = useCallback(
    async (action: SessionMenuActionId, row: ConvRow) => {
      if (!token) return;
      if (action === "rename") {
        openRename(row);
        return;
      }
      if (action === "delete") {
        openDelete(row);
        return;
      }
      if (action === "toggle-pin") {
        togglePinConversation(row.id);
        return;
      }
      if (action === "duplicate") {
        try {
          const res = await duplicateConversation(token, row.id);
          if (res.ok && res.conversation?.id) {
            queryClient.invalidateQueries({ queryKey: ["conversations", "sidebar"] });
            navigate(`/app/chat?conversationId=${encodeURIComponent(res.conversation.id)}`);
          }
        } catch (e) {
          setToastMsg(e instanceof Error ? e.message : "Duplicate failed");
        }
        return;
      }
      if (action === "summarize") {
        try {
          const d = await fetchConversationDetail(token, row.id);
          const text = buildConversationExtractiveDigest(d);
          setDigestDialog({ title: row.title, text });
        } catch (e) {
          setToastMsg(e instanceof Error ? e.message : "Could not load session");
        }
        return;
      }
      if (action === "studio") {
        navigate(`/app/studio?fromConversation=${encodeURIComponent(row.id)}`);
        return;
      }
      if (action === "move-workspace") {
        navigate("/app/tasks", { state: { focusConversationId: row.id } });
        setMobileOpen?.(false);
        return;
      }
      if (action === "add-tag") {
        setTagDialog({ row, draft: "" });
        return;
      }
      if (action === "export") {
        try {
          const d = await fetchConversationDetail(token, row.id);
          const md = buildConversationMarkdownExport(d);
          const safe = (row.title || "session").replace(/[^\w\-\s]+/g, "").replace(/\s+/g, "_").slice(0, 80) || "session";
          downloadTextFile(`${safe}.md`, md, "text/markdown;charset=utf-8");
        } catch (e) {
          setToastMsg(e instanceof Error ? e.message : "Export failed");
        }
        return;
      }
      if (action === "share") {
        try {
          const url = `${window.location.origin}/app/chat?conversationId=${encodeURIComponent(row.id)}`;
          await navigator.clipboard.writeText(url);
          setToastMsg("Session link copied to clipboard");
        } catch {
          setToastMsg("Could not copy link");
        }
        return;
      }
      if (action === "vault") {
        try {
          const d = await fetchConversationDetail(token, row.id);
          const md = buildConversationMarkdownExport(d);
          sessionStorage.setItem(
            "malv_vault_pending_note",
            JSON.stringify({
              label: `Session: ${row.title.slice(0, 120)}`,
              content: md.slice(0, 120_000)
            })
          );
        } catch {
          sessionStorage.setItem(
            "malv_vault_pending_note",
            JSON.stringify({
              label: row.title.slice(0, 120),
              content: `Conversation ID: ${row.id}\n\nUse Export from the session menu to attach a full transcript after unlock.`
            })
          );
        }
        navigate("/app/vault");
        setMobileOpen?.(false);
        return;
      }
    },
    [token, queryClient, navigate, openRename, openDelete, setMobileOpen]
  );

  const runRename = useCallback(async () => {
    if (!token || !dialog || dialog.type !== "rename") return;
    const title = renameDraft.trim();
    if (!title) return;
    await renameConversation(token, dialog.id, title);
    setDialog(null);
    setAllRowsForSearch(null);
    setSearchQuery("");
    queryClient.invalidateQueries({ queryKey: ["conversations", "sidebar"] });
  }, [dialog, queryClient, renameConversation, renameDraft, token]);

  const runDelete = useCallback(async () => {
    if (!token || !dialog || dialog.type !== "delete") return;
    await deleteConversation(token, dialog.id);
    setDialog(null);
    setAllRowsForSearch(null);
    setSearchQuery("");
    queryClient.invalidateQueries({ queryKey: ["conversations", "sidebar"] });
  }, [deleteConversation, dialog, queryClient, token]);

  const tokenPayload = token ? (parseAccessTokenPayload(token) as Record<string, unknown> | null) : null;
  const sub = typeof tokenPayload?.sub === "string" ? tokenPayload.sub : null;
  const email = pickFirstString(authEmail, tokenPayload?.email, sub && sub.includes("@") ? sub : null);
  const emailLocalPart = email?.split("@")[0] ?? null;
  const firstName = pickFirstString(tokenPayload?.firstName, tokenPayload?.given_name, tokenPayload?.givenName);
  const lastName = pickFirstString(tokenPayload?.lastName, tokenPayload?.family_name, tokenPayload?.familyName);
  const joinedName = firstName || lastName ? [firstName, lastName].filter(Boolean).join(" ").trim() : null;

  const providerProfileName = pickFirstString(
    tokenPayload?.googleName,
    tokenPayload?.google_profile_name,
    tokenPayload?.providerName,
    tokenPayload?.provider_profile_name,
    tokenPayload?.oauthName,
    tokenPayload?.oauth_profile_name,
    tokenPayload?.name
  );
  const displayNameCandidate = pickFirstString(
    joinedName,
    tokenPayload?.fullName,
    authDisplayName,
    tokenPayload?.displayName,
    providerProfileName,
    tokenPayload?.username,
    tokenPayload?.preferred_username,
    emailLocalPart
  );
  const displayName = displayNameCandidate && !isLikelyInternalId(displayNameCandidate) ? displayNameCandidate : "My account";
  const secondaryLabel = email ?? "Signed in";
  const userInitial = (displayName.trim().charAt(0) || "M").toUpperCase();

  const chatConversationIdFromUrl =
    location.pathname === "/app/chat" ? new URLSearchParams(location.search).get("conversationId") : null;

  const sessionRowIsActive = useCallback(
    (id: string) => {
      const pathDetail = location.pathname === `/app/conversations/${id}`;
      const chatMatch = chatConversationIdFromUrl === id;
      return pathDetail || chatMatch;
    },
    [chatConversationIdFromUrl, location.pathname]
  );

  function closeMobile() {
    setMobileOpen?.(false);
  }

  return (
    <>
      <AnimatePresence>
        {mobileOpen ? (
          <motion.button
            type="button"
            aria-label="Close menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
            onClick={closeMobile}
          />
        ) : null}
      </AnimatePresence>

      <motion.aside
        data-malv-app-sidebar
        className={[
          "fixed left-0 top-0 z-50 flex h-[100dvh] max-h-[100dvh] w-[min(100vw-3rem,18rem)] flex-col overflow-hidden border-r lg:static lg:z-0 lg:h-full lg:max-h-full lg:shrink-0 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        ].join(" ")}
        style={{
          background: "rgb(var(--malv-surface-base-rgb))",
          borderColor: "rgb(var(--malv-border-rgb) / 0.04)",
          transition: "background-color 220ms ease, border-color 220ms ease"
        }}
        transition={{ type: "spring", damping: 28, stiffness: 320 }}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src="/malv-mark.svg?v=3"
              alt="MALV logo"
              width={36}
              height={36}
              className="shrink-0"
              decoding="async"
            />
            <span className="truncate text-lg font-semibold tracking-tight text-malv-text">MALV</span>
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-malv-text/60 hover:bg-white/5 hover:text-malv-text lg:hidden"
            onClick={closeMobile}
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="shrink-0 px-3 pb-3">
          <Link
            to="/app/chat?fresh=1"
            onClick={closeMobile}
            className="group relative flex w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-[transform,box-shadow,border-color,background-color] duration-200 hover:scale-[1.03] hover:border-white/[0.14] hover:bg-white/[0.08] active:scale-[0.98]"
          >
            <span
              className="pointer-events-none absolute -inset-px rounded-2xl opacity-50 blur-xl transition-opacity duration-200 group-hover:opacity-80"
              style={{
                background:
                  "radial-gradient(ellipse 80% 60% at 50% 0%, oklch(0.65 0.16 200 / 0.35), transparent 55%)"
              }}
              aria-hidden
            />
            <span className="relative flex w-full flex-col items-center justify-center gap-0.5 px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm font-medium tracking-tight text-malv-text">
                <Plus className="h-4 w-4 shrink-0 text-[oklch(0.72_0.16_200)]" strokeWidth={2.25} />
                New Chat
              </span>
              <span className="text-[10px] font-normal text-malv-text/45">{newChatShortcutHint}</span>
            </span>
          </Link>
        </div>

        <nav className="shrink-0 px-3 pb-2" aria-label="Sidebar navigation">
          <div className="space-y-0.5">
            {menu.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={closeMobile}
                  className={({ isActive }) =>
                    [
                      "relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-[background-color,color,box-shadow,transform]",
                      isActive
                        ? "bg-[linear-gradient(135deg,oklch(0.18_0.03_255/0.92),oklch(0.15_0.03_265/0.9))] text-malv-text/96 ring-1 ring-inset ring-[oklch(0.7_0.18_200/0.32)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_22px_rgba(6,12,24,0.35)] [text-shadow:0_0_12px_rgba(103,191,255,0.18)]"
                        : "text-malv-text/76 hover:bg-white/[0.05] hover:text-malv-text/92 hover:translate-x-[1px]"
                    ].join(" ")
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive ? (
                        <motion.span
                          layoutId="sidebar-active"
                          className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r bg-[oklch(0.7_0.18_200)]"
                        />
                      ) : null}
                      <item.icon className="h-4 w-4 shrink-0 opacity-90" />
                      <span className="flex-1 truncate text-left">{item.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
          </div>
        </nav>

        <div className="mx-3 shrink-0 py-2">
          <div className="h-px" style={{ background: "rgb(var(--malv-border-rgb) / 0.08)" }} />
        </div>

        <div className="mx-3 shrink-0 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-malv-text/35" />
            <input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchPage(0);
              }}
              placeholder="Search sessions…"
              aria-label="Search sessions"
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-9 py-2.5 text-sm text-malv-text/88 placeholder:text-malv-text/38 outline-none transition-[box-shadow,border-color] focus:border-[oklch(0.55_0.12_200/0.45)] focus:shadow-[0_0_0_2px_rgba(96,165,250,0.18)]"
            />
            {searchQuery.trim() ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSearchPage(0);
                }}
                aria-label="Clear search"
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-lg p-2 text-malv-text/45 hover:bg-white/[0.06] hover:text-malv-text focus:outline-none"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {convError && !debouncedSearchQuery.trim() ? (
            <div className="space-y-2 px-1">
              <p className="px-2 text-sm text-red-200/90">
                {convQueryError instanceof Error ? parseNestErrorMessage(convQueryError) : "Couldn’t load sessions."}
              </p>
              <button
                type="button"
                onClick={() => void refetchConversations()}
                className="rounded-xl border border-white/[0.10] bg-white/[0.04] px-3 py-2 text-sm text-malv-text/85 hover:bg-white/[0.07] active:scale-[0.99]"
              >
                Retry
              </button>
            </div>
          ) : convLoading && !debouncedSearchQuery.trim() ? (
            <div className="space-y-2 px-1">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-11 animate-pulse rounded-lg bg-white/[0.06]" />
              ))}
            </div>
          ) : debouncedSearchQuery.trim() ? (
            <div className="space-y-2">
              <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-malv-text/46">
                {searchLoading ? "Searching…" : `${searchMatches.length} match${searchMatches.length === 1 ? "" : "es"}`}
              </p>
              {searchLoading ? (
                <div className="space-y-2 px-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-11 animate-pulse rounded-lg bg-white/[0.06]" />
                  ))}
                </div>
              ) : searchResults.length === 0 ? (
                <p className="px-2 text-sm text-malv-text/50">No sessions match.</p>
              ) : (
                <div className="space-y-0.5">
                  {searchResults.map((c) => {
                    const active = sessionRowIsActive(c.id);
                    return (
                      <div key={c.id} className="group relative">
                        <Link
                          to={c.href}
                          onClick={closeMobile}
                          className={[
                            "flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-[background-color,color,transform,box-shadow] active:scale-[0.99]",
                            active
                              ? "bg-[linear-gradient(135deg,oklch(0.18_0.03_255/0.92),oklch(0.15_0.03_265/0.9))] text-malv-text/96 ring-1 ring-inset ring-[oklch(0.7_0.18_200/0.32)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_22px_rgba(6,12,24,0.35)] [text-shadow:0_0_12px_rgba(103,191,255,0.18)]"
                              : "text-malv-text/76 hover:bg-white/[0.05] hover:text-malv-text/92 hover:translate-x-[1px]"
                          ].join(" ")}
                        >
                          {active ? (
                            <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-[oklch(0.7_0.18_200)]" />
                          ) : null}
                          <span className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-start gap-1.5">
                              {isConversationPinned(c.id) ? (
                                <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[oklch(0.72_0.16_200/0.9)]" strokeWidth={2.25} aria-hidden />
                              ) : null}
                              <span
                                className="min-w-0 flex-1 truncate whitespace-nowrap text-sm font-medium leading-snug"
                                title={c.title}
                              >
                                {c.title}
                              </span>
                            </div>
                            {getConversationTags(c.id).length ? (
                              <div className="mt-1 flex flex-wrap items-center gap-1 pl-0">
                                {getConversationTags(c.id).map((tag) => (
                                  <span
                                    key={`${c.id}-search-tag-${tag}`}
                                    className={[
                                      "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-[3px] text-[10px] font-medium tracking-[0.01em] transition-all duration-200 ease-out",
                                      "border-[oklch(0.64_0.1_205/0.22)] bg-[linear-gradient(135deg,oklch(0.2_0.03_245/0.42),oklch(0.16_0.03_258/0.34))] text-malv-text/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_10px_oklch(0.62_0.14_205/0.12)]",
                                      "group-hover:scale-[1.02] group-hover:border-[oklch(0.68_0.12_205/0.3)] group-hover:text-malv-text/86 group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_14px_oklch(0.62_0.14_205/0.2)]",
                                      active
                                        ? "border-[oklch(0.7_0.16_205/0.4)] bg-[linear-gradient(135deg,oklch(0.62_0.15_208/0.32),oklch(0.56_0.13_250/0.24))] text-[oklch(0.95_0.03_205)] shadow-[0_0_0_1px_oklch(0.7_0.16_205/0.22),0_0_16px_oklch(0.58_0.13_205/0.24)]"
                                        : ""
                                    ].join(" ")}
                                  >
                                    <span
                                      aria-hidden
                                      className={[
                                        "h-1.25 w-1.25 shrink-0 rounded-full transition-colors duration-200",
                                        active ? "bg-[oklch(0.9_0.06_205)]/95" : "bg-[oklch(0.76_0.14_205/0.82)]"
                                      ].join(" ")}
                                    />
                                    <span className="truncate">{tag}</span>
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </span>
                          <div id={`conv-menu-${c.id}`} className="relative shrink-0">
                            <button
                              type="button"
                              aria-label="Session menu"
                              className={[
                                "rounded-lg p-2 text-malv-text/45 transition-opacity focus:outline-none",
                                "opacity-0 group-hover:opacity-100",
                                menuOpenForId === c.id ? "opacity-100" : ""
                              ].join(" ")}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setMenuOpenForId((prev) => (prev === c.id ? null : c.id));
                              }}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                            <ConversationSessionMenu
                              row={c}
                              open={menuOpenForId === c.id}
                              onOpenChange={(next) => setMenuOpenForId(next ? c.id : null)}
                              isPinned={isConversationPinned(c.id)}
                              onRunAction={(action, row) => void handleSessionAction(action, row)}
                            />
                          </div>
                        </Link>
                      </div>
                    );
                  })}
                  {hasSearchNextPage ? (
                    <button
                      type="button"
                      onClick={() => setSearchPage((p) => p + 1)}
                      className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-malv-text/70 hover:bg-white/[0.05] hover:text-malv-text transition-colors active:scale-[0.99]"
                    >
                      Next results
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          ) : recentSessions.length === 0 ? (
            <p className="px-2 text-sm text-malv-text/50">No sessions yet.</p>
          ) : (
            <div className="space-y-0.5">
                    {recentSessions.map((c) => {
                      const active = sessionRowIsActive(c.id);
                      return (
                        <div key={c.id} className="group relative">
                          <Link
                            to={c.href}
                            onClick={closeMobile}
                            className={[
                            "flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-[background-color,color,transform,box-shadow] active:scale-[0.99]",
                              active
                                ? "bg-[linear-gradient(135deg,oklch(0.18_0.03_255/0.92),oklch(0.15_0.03_265/0.9))] text-malv-text/96 ring-1 ring-inset ring-[oklch(0.7_0.18_200/0.32)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_22px_rgba(6,12,24,0.35)] [text-shadow:0_0_12px_rgba(103,191,255,0.18)]"
                                : "text-malv-text/76 hover:bg-white/[0.05] hover:text-malv-text/92 hover:translate-x-[1px]"
                            ].join(" ")}
                          >
                            {active ? (
                              <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-[oklch(0.7_0.18_200)]" />
                            ) : null}
                            <span className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-start gap-1.5">
                                {isConversationPinned(c.id) ? (
                                  <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[oklch(0.72_0.16_200/0.9)]" strokeWidth={2.25} aria-hidden />
                                ) : null}
                                <span
                                  className="min-w-0 flex-1 truncate whitespace-nowrap text-sm font-medium leading-snug"
                                  title={c.title}
                                >
                                  {c.title}
                                </span>
                              </div>
                              {getConversationTags(c.id).length ? (
                                <div className="mt-1 flex flex-wrap items-center gap-1 pl-0">
                                  {getConversationTags(c.id).map((tag) => (
                                    <span
                                      key={`${c.id}-group-tag-${tag}`}
                                      className={[
                                        "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-[3px] text-[10px] font-medium tracking-[0.01em] transition-all duration-200 ease-out",
                                        "border-[oklch(0.64_0.1_205/0.22)] bg-[linear-gradient(135deg,oklch(0.2_0.03_245/0.42),oklch(0.16_0.03_258/0.34))] text-malv-text/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_10px_oklch(0.62_0.14_205/0.12)]",
                                        "group-hover:scale-[1.02] group-hover:border-[oklch(0.68_0.12_205/0.3)] group-hover:text-malv-text/86 group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_14px_oklch(0.62_0.14_205/0.2)]",
                                        active
                                          ? "border-[oklch(0.7_0.16_205/0.4)] bg-[linear-gradient(135deg,oklch(0.62_0.15_208/0.32),oklch(0.56_0.13_250/0.24))] text-[oklch(0.95_0.03_205)] shadow-[0_0_0_1px_oklch(0.7_0.16_205/0.22),0_0_16px_oklch(0.58_0.13_205/0.24)]"
                                          : ""
                                      ].join(" ")}
                                    >
                                      <span
                                        aria-hidden
                                        className={[
                                          "h-1.25 w-1.25 shrink-0 rounded-full transition-colors duration-200",
                                          active ? "bg-[oklch(0.9_0.06_205)]/95" : "bg-[oklch(0.76_0.14_205/0.82)]"
                                        ].join(" ")}
                                      />
                                      <span className="truncate">{tag}</span>
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </span>
                          <div id={`conv-menu-${c.id}`} className="relative shrink-0">
                              <button
                                type="button"
                                aria-label="Session menu"
                                className={[
                                  "rounded-lg p-2 text-malv-text/45 transition-opacity focus:outline-none",
                                  "opacity-0 group-hover:opacity-100",
                                  menuOpenForId === c.id ? "opacity-100" : ""
                                ].join(" ")}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setMenuOpenForId((prev) => (prev === c.id ? null : c.id));
                                }}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                              <ConversationSessionMenu
                                row={c}
                                open={menuOpenForId === c.id}
                                onOpenChange={(next) => setMenuOpenForId(next ? c.id : null)}
                                isPinned={isConversationPinned(c.id)}
                                onRunAction={(action, row) => void handleSessionAction(action, row)}
                              />
                            </div>
                          </Link>
                        </div>
                      );
                    })}
            </div>
          )}
        </div>

        <PortalLayer>
          <AnimatePresence>
            {dialog
              ? isDesktopLayout
                ? (
                    <motion.div
                      key={dialog.type}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.14 }}
                      className="fixed inset-0 z-[100] bg-black/55 backdrop-blur-[2px]"
                      onClick={() => setDialog(null)}
                    >
                      <motion.div
                        initial={{ opacity: 0, scale: 0.985, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.99, y: 8 }}
                        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                        }}
                        className="absolute left-[54%] top-[20%] w-[min(92vw,420px)] -translate-x-1/2 overflow-hidden rounded-[18px] border border-white/[0.11] bg-[#0B0F14]/90 backdrop-blur-xl shadow-[0_24px_68px_rgba(0,0,0,0.55),0_10px_32px_rgba(0,0,0,0.34)]"
                        role="dialog"
                        aria-label={dialog.type === "rename" ? "Rename conversation" : "Delete conversation"}
                      >
                        {dialog.type === "rename" ? (
                          <>
                            <div className="border-b border-white/[0.08] px-5 pb-4 pt-4">
                              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-malv-text/45">SESSION ACTION</div>
                              <div className="mt-1.5 text-[15px] font-semibold text-malv-text/95">Rename session</div>
                              <div className="mt-2.5 text-[11px] leading-relaxed text-malv-text/50">Update the title shown in your sidebar.</div>
                            </div>
                            <div className="px-5 py-4">
                              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                <input
                                  ref={renameInputRef}
                                  value={renameDraft}
                                  onChange={(e) => setRenameDraft(e.target.value)}
                                  className="w-full rounded-xl border border-white/[0.10] bg-white/[0.03] px-3 py-2.5 text-sm text-malv-text outline-none focus:border-[oklch(0.55_0.12_200/0.45)] focus:shadow-[0_0_0_2px_rgba(96,165,250,0.18)]"
                                  maxLength={160}
                                  placeholder="Session title"
                                />
                                <p className="mt-2 text-[11px] text-malv-text/45">Up to 160 characters.</p>
                              </div>
                            </div>
                            <div className="border-t border-white/[0.08] px-5 pb-4 pt-3">
                              <div className="flex flex-col gap-2.5">
                                <button
                                  type="button"
                                  onClick={() => void runRename()}
                                  className="w-full rounded-xl bg-[oklch(0.7_0.18_200)] px-3 py-2.5 text-sm font-medium text-[oklch(0.08_0.015_260)] hover:brightness-[1.05] active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-[oklch(0.7_0.18_200/0.4)]"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDialog(null)}
                                  className="w-full rounded-xl border border-white/[0.10] bg-white/[0.03] px-3 py-2.5 text-sm text-malv-text/80 hover:bg-white/[0.06] hover:text-malv-text active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-white/15"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="border-b border-white/[0.08] px-5 pb-4 pt-4">
                              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-malv-text/45">SESSION ACTION</div>
                              <div className="mt-1.5 text-[15px] font-semibold text-malv-text/95">Delete session</div>
                              <div className="mt-2.5 text-[11px] leading-relaxed text-malv-text/50">This removes the session from your sidebar.</div>
                            </div>
                            <div className="px-5 py-4">
                              <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-3 text-[12px] leading-relaxed text-red-100/90">
                                This action permanently removes the session from your sidebar.
                              </div>
                            </div>
                            <div className="border-t border-white/[0.08] px-5 pb-4 pt-3">
                              <div className="flex flex-col gap-2.5">
                                <button
                                  type="button"
                                  onClick={() => void runDelete()}
                                  className="w-full rounded-xl bg-red-500/[0.18] px-3 py-2.5 text-sm font-medium text-red-100 hover:bg-red-500/[0.24] active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-red-400/25"
                                >
                                  Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDialog(null)}
                                  className="w-full rounded-xl border border-white/[0.10] bg-white/[0.03] px-3 py-2.5 text-sm text-malv-text/80 hover:bg-white/[0.06] hover:text-malv-text active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-white/15"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </motion.div>
                    </motion.div>
                  )
                : (
                    <motion.div
                      key={dialog.type}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.14 }}
                      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 px-3 pb-[max(1rem,calc(env(safe-area-inset-bottom)+0.75rem))] backdrop-blur-[2px]"
                      onClick={() => setDialog(null)}
                    >
                      <motion.div
                        initial={{ y: 36, opacity: 0, scale: 0.985 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 24, opacity: 0, scale: 0.985 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                        }}
                        className="mx-auto flex min-h-0 w-full max-w-[640px] flex-col overflow-hidden rounded-[1.35rem] border border-white/[0.12] bg-[#080c11]/98 shadow-[0_24px_64px_rgba(0,0,0,0.62)] backdrop-blur-xl"
                        style={{
                          maxHeight: "min(84dvh, 760px)"
                        }}
                        role="dialog"
                        aria-modal="true"
                        aria-label={dialog.type === "rename" ? "Rename conversation" : "Delete conversation"}
                      >
                        <div className="flex shrink-0 flex-col items-center pt-3 pb-1">
                          <div className="h-1 w-10 rounded-full bg-white/22" aria-hidden />
                        </div>

                        {dialog.type === "rename" ? (
                          <>
                            <div className="shrink-0 border-b border-white/[0.07] px-5 pb-4 pt-2">
                              <p className="text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-white/38">SESSION ACTION</p>
                              <p className="mt-1.5 text-center text-[16px] font-semibold text-malv-text/95">Rename</p>
                              <p className="mt-2.5 text-center text-[11px] leading-relaxed text-malv-text/50">Update the title shown in your sidebar.</p>
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                <input
                                  ref={renameInputRef}
                                  value={renameDraft}
                                  onChange={(e) => setRenameDraft(e.target.value)}
                                  className="w-full rounded-xl border border-white/[0.10] bg-white/[0.03] px-3 py-2.5 text-[15px] text-malv-text outline-none focus:border-[oklch(0.55_0.12_200/0.45)] focus:shadow-[0_0_0_2px_rgba(96,165,250,0.18)]"
                                  maxLength={160}
                                  placeholder="Session title"
                                />
                                <p className="mt-2 text-[11px] text-malv-text/45">Up to 160 characters.</p>
                              </div>
                            </div>
                            <div className="shrink-0 border-t border-white/[0.07] px-5 pb-5 pt-4">
                              <div className="flex flex-col gap-3">
                                <button
                                  type="button"
                                  onClick={() => void runRename()}
                                  className="w-full rounded-xl bg-[oklch(0.7_0.18_200)] px-3 py-3 text-sm font-medium text-[oklch(0.08_0.015_260)] hover:brightness-[1.05] active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-[oklch(0.7_0.18_200/0.4)]"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDialog(null)}
                                  className="w-full rounded-xl border border-white/[0.10] bg-white/[0.03] px-3 py-3 text-sm text-malv-text/80 hover:bg-white/[0.06] hover:text-malv-text active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-white/15"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="shrink-0 border-b border-white/[0.07] px-5 pb-4 pt-2">
                              <p className="text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-white/38">SESSION ACTION</p>
                              <p className="mt-1.5 text-center text-[16px] font-semibold text-malv-text/95">Delete</p>
                              <p className="mt-2.5 text-center text-[11px] leading-relaxed text-malv-text/50">This removes the session from your sidebar.</p>
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                              <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-4 text-[13px] leading-relaxed text-red-100/90">
                                This will permanently remove the session from your sidebar.
                              </div>
                            </div>
                            <div className="shrink-0 border-t border-white/[0.07] px-5 pb-5 pt-4">
                              <div className="flex flex-col gap-3">
                                <button
                                  type="button"
                                  onClick={() => void runDelete()}
                                  className="w-full rounded-xl bg-red-500/[0.18] px-3 py-3 text-sm font-medium text-red-100 hover:bg-red-500/[0.24] active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-red-400/25"
                                >
                                  Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDialog(null)}
                                  className="w-full rounded-xl border border-white/[0.10] bg-white/[0.03] px-3 py-3 text-sm text-malv-text/80 hover:bg-white/[0.06] hover:text-malv-text active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-white/15"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </motion.div>
                    </motion.div>
                  )
              : null}
          </AnimatePresence>
        </PortalLayer>

        <PortalLayer>
          <AnimatePresence>
            {digestDialog
              ? isDesktopLayout
                ? (
                    <motion.div
                      key="digest"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.14 }}
                      className="fixed inset-0 z-[110] bg-black/55 backdrop-blur-[2px]"
                      onClick={() => setDigestDialog(null)}
                    >
                      <motion.div
                        initial={{ opacity: 0, scale: 0.985, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.99, y: 8 }}
                        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                        }}
                        className="absolute left-[54%] top-[16%] flex w-[min(92vw,440px)] max-h-[min(74vh,600px)] -translate-x-1/2 flex-col overflow-hidden rounded-[18px] border border-white/[0.11] bg-[#0B0F14]/90 backdrop-blur-xl shadow-[0_24px_68px_rgba(0,0,0,0.55),0_10px_32px_rgba(0,0,0,0.34)]"
                        role="dialog"
                        aria-label="Conversation digest"
                      >
                        <div className="border-b border-white/[0.08] px-5 pb-4 pt-4">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-malv-text/45">SESSION DIGEST</div>
                          <div className="mt-1.5 text-[15px] font-semibold text-malv-text/95">Session digest</div>
                          <div className="mt-2 truncate text-[11px] text-malv-text/55">{digestDialog.title}</div>
                          <p className="mt-2.5 text-[11px] leading-relaxed text-malv-text/45">
                            Generated locally from your transcript (structured extract — not a model-generated summary).
                          </p>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                            <pre className="max-h-[min(34vh,280px)] overflow-y-auto whitespace-pre-wrap break-words text-[12px] leading-relaxed text-malv-text/88 [scrollbar-width:thin]">
                              {digestDialog.text}
                            </pre>
                          </div>
                        </div>
                        <div className="border-t border-white/[0.08] px-5 pb-4 pt-3">
                          <div className="flex flex-col gap-2.5">
                            <button
                              type="button"
                              className="w-full rounded-xl bg-[oklch(0.7_0.18_200)] px-3 py-2.5 text-sm font-medium text-[oklch(0.08_0.015_260)] hover:brightness-[1.05] focus-visible:ring-2 focus-visible:ring-[oklch(0.7_0.18_200/0.35)]"
                              onClick={() => {
                                downloadTextFile("session-digest.md", digestDialog.text, "text/markdown;charset=utf-8");
                              }}
                            >
                              Download .md
                            </button>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="flex-1 rounded-xl border border-white/[0.10] bg-white/[0.03] px-3 py-2 text-sm text-malv-text/80 hover:bg-white/[0.06] hover:text-malv-text active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-white/15"
                                onClick={() => {
                                  void navigator.clipboard.writeText(digestDialog.text).then(
                                    () => setToastMsg("Digest copied"),
                                    () => setToastMsg("Copy failed")
                                  );
                                }}
                              >
                                Copy
                              </button>
                              <button
                                type="button"
                                className="flex-1 rounded-xl border border-white/[0.10] bg-white/[0.03] px-3 py-2 text-sm text-malv-text/80 hover:bg-white/[0.06] hover:text-malv-text active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-white/15"
                                onClick={() => setDigestDialog(null)}
                              >
                                Close
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    </motion.div>
                  )
                : (
                    <motion.div
                      key="digest"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.14 }}
                      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/55 px-3 pb-[max(1rem,calc(env(safe-area-inset-bottom)+0.75rem))] backdrop-blur-[2px]"
                      onClick={() => setDigestDialog(null)}
                    >
                      <motion.div
                        initial={{ y: 36, opacity: 0, scale: 0.985 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 24, opacity: 0, scale: 0.985 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                        }}
                        className="mx-auto flex min-h-0 w-full max-w-[640px] flex-col overflow-hidden rounded-[1.35rem] border border-white/[0.12] bg-[#080c11]/98 shadow-[0_24px_64px_rgba(0,0,0,0.62)] backdrop-blur-xl"
                        style={{
                          maxHeight: "min(84dvh, 760px)"
                        }}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Conversation digest"
                      >
                        <div className="flex shrink-0 flex-col items-center pb-1 pt-3">
                          <div className="h-1 w-10 rounded-full bg-white/22" aria-hidden />
                        </div>
                        <div className="shrink-0 border-b border-white/[0.07] px-5 pb-4 pt-2">
                          <p className="text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-white/38">SESSION DIGEST</p>
                          <div className="mt-1.5 text-center text-[16px] font-semibold text-malv-text/95">
                            {digestDialog.title}
                          </div>
                          <p className="mt-2.5 text-center text-[11px] leading-relaxed text-malv-text/50">
                            Generated locally from your transcript (structured extract — not a model-generated summary).
                          </p>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                            <pre className="max-h-[min(48dvh,440px)] overflow-y-auto whitespace-pre-wrap break-words text-[12px] leading-relaxed text-malv-text/88 [scrollbar-width:thin]">
                              {digestDialog.text}
                            </pre>
                          </div>
                        </div>
                        <div className="shrink-0 border-t border-white/[0.07] px-5 pb-5 pt-4">
                          <div className="flex flex-col gap-3">
                            <button
                              type="button"
                              className="w-full rounded-xl bg-[oklch(0.7_0.18_200)] px-3 py-3 text-sm font-medium text-[oklch(0.08_0.015_260)] hover:brightness-[1.05] active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-[oklch(0.7_0.18_200/0.35)]"
                              onClick={() => {
                                downloadTextFile("session-digest.md", digestDialog.text, "text/markdown;charset=utf-8");
                              }}
                            >
                              Download .md
                            </button>
                            <div className="flex gap-2.5">
                              <button
                                type="button"
                                className="flex-1 rounded-xl border border-white/[0.10] bg-white/[0.03] px-3 py-3 text-sm text-malv-text/80 hover:bg-white/[0.06] hover:text-malv-text active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-white/15"
                                onClick={() => {
                                  void navigator.clipboard.writeText(digestDialog.text).then(
                                    () => setToastMsg("Digest copied"),
                                    () => setToastMsg("Copy failed")
                                  );
                                }}
                              >
                                Copy
                              </button>
                              <button
                                type="button"
                                className="flex-1 rounded-xl border border-white/[0.10] bg-white/[0.03] px-3 py-3 text-sm text-malv-text/80 hover:bg-white/[0.06] hover:text-malv-text active:scale-[0.99]"
                                onClick={() => setDigestDialog(null)}
                              >
                                Close
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    </motion.div>
                  )
              : null}
          </AnimatePresence>
        </PortalLayer>

        <PortalLayer>
          <AnimatePresence>
            {tagDialog
              ? isDesktopLayout
                ? (
                    <motion.div
                      key="tag"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-[110] bg-black/55 backdrop-blur-[2px]"
                      onClick={() => setTagDialog(null)}
                    >
                      <motion.div
                        initial={{ opacity: 0, scale: 0.985, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.99, y: 8 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                        }}
                        className="absolute left-[54%] top-[22%] w-[min(92vw,420px)] -translate-x-1/2 overflow-hidden rounded-[18px] border border-white/[0.11] bg-[#0B0F14]/90 backdrop-blur-xl shadow-[0_24px_68px_rgba(0,0,0,0.55),0_10px_32px_rgba(0,0,0,0.34)]"
                        role="dialog"
                        aria-label="Add tag"
                      >
                        <div className="border-b border-white/[0.08] px-5 pb-4 pt-4">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-malv-text/45">SESSION ACTION</div>
                          <div className="mt-1.5 text-[15px] font-semibold text-malv-text/95">Add tag</div>
                          <div className="mt-2 truncate text-[11px] text-malv-text/55">{tagDialog.row.title}</div>
                        </div>
                        <div className="px-5 py-4">
                          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                            <input
                              value={tagDialog.draft}
                              onChange={(e) =>
                                setTagDialog((d) => (d ? { ...d, draft: e.target.value } : null))
                              }
                              maxLength={40}
                              placeholder="e.g. client, sprint, research"
                              className="w-full rounded-xl border border-white/[0.10] bg-white/[0.03] px-3 py-2.5 text-sm text-malv-text outline-none focus:border-[oklch(0.55_0.12_200/0.45)]"
                            />
                            <p className="mt-2 text-[11px] text-malv-text/45">Tags are stored on this device for sidebar organization.</p>
                          </div>
                        </div>
                        <div className="border-t border-white/[0.08] px-5 pb-4 pt-3">
                          <div className="flex flex-col gap-2.5">
                            <button
                              type="button"
                              className="w-full rounded-xl bg-[oklch(0.7_0.18_200)] px-3 py-2.5 text-sm font-medium text-[oklch(0.08_0.015_260)] hover:brightness-[1.05] active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-[oklch(0.7_0.18_200/0.35)]"
                              onClick={() => {
                                const t = tagDialog.draft.trim();
                                if (t) addConversationTag(tagDialog.row.id, t);
                                setTagDialog(null);
                              }}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="w-full rounded-xl border border-white/[0.10] bg-white/[0.03] px-3 py-2.5 text-sm text-malv-text/80 hover:bg-white/[0.06] hover:text-malv-text active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-white/15"
                              onClick={() => setTagDialog(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    </motion.div>
                  )
                : (
                    <motion.div
                      key="tag"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/55 px-3 pb-[max(1rem,calc(env(safe-area-inset-bottom)+0.75rem))] backdrop-blur-[2px]"
                      onClick={() => setTagDialog(null)}
                    >
                      <motion.div
                        initial={{ y: 36, opacity: 0, scale: 0.985 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 24, opacity: 0, scale: 0.985 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                        }}
                        className="mx-auto flex min-h-0 w-full max-w-[640px] flex-col overflow-hidden rounded-[1.35rem] border border-white/[0.12] bg-[#080c11]/98 shadow-[0_24px_64px_rgba(0,0,0,0.62)] backdrop-blur-xl"
                        style={{
                          maxHeight: "min(84dvh, 760px)"
                        }}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Add tag"
                      >
                        <div className="flex shrink-0 flex-col items-center pt-3 pb-1">
                          <div className="h-1 w-10 rounded-full bg-white/22" aria-hidden />
                        </div>
                        <div className="shrink-0 border-b border-white/[0.07] px-5 pb-4 pt-2">
                          <p className="text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-white/38">SESSION ACTION</p>
                          <p className="mt-1.5 text-center text-[16px] font-semibold text-malv-text/95">Add tag</p>
                          <p className="mt-2 truncate text-center text-[12px] text-malv-text/55">{tagDialog.row.title}</p>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                            <input
                              value={tagDialog.draft}
                              onChange={(e) =>
                                setTagDialog((d) => (d ? { ...d, draft: e.target.value } : null))
                              }
                              maxLength={40}
                              placeholder="e.g. client, sprint, research"
                              className="w-full rounded-xl border border-white/[0.10] bg-white/[0.03] px-3 py-2.5 text-[15px] text-malv-text outline-none focus:border-[oklch(0.55_0.12_200/0.45)]"
                            />
                            <p className="mt-2 text-[11px] text-malv-text/45">Tags are stored on this device for sidebar organization.</p>
                          </div>
                        </div>
                        <div className="shrink-0 border-t border-white/[0.07] px-5 pb-5 pt-4">
                          <div className="flex flex-col gap-3">
                            <button
                              type="button"
                              className="w-full rounded-xl bg-[oklch(0.7_0.18_200)] px-3 py-3 text-sm font-medium text-[oklch(0.08_0.015_260)] hover:brightness-[1.05] active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-[oklch(0.7_0.18_200/0.35)]"
                              onClick={() => {
                                const t = tagDialog.draft.trim();
                                if (t) addConversationTag(tagDialog.row.id, t);
                                setTagDialog(null);
                              }}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="w-full rounded-xl border border-white/[0.10] bg-white/[0.03] px-3 py-3 text-sm text-malv-text/80 hover:bg-white/[0.06] hover:text-malv-text active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-white/15"
                              onClick={() => setTagDialog(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    </motion.div>
                  )
              : null}
          </AnimatePresence>
        </PortalLayer>

        {toastMsg ? (
          <div className="pointer-events-none fixed bottom-5 left-1/2 z-[300] max-w-[min(92vw,360px)] -translate-x-1/2 rounded-xl border border-white/[0.12] bg-[oklch(0.12_0.02_260)] px-4 py-2.5 text-center text-sm text-malv-text shadow-[0_16px_48px_rgba(0,0,0,0.55)]">
            {toastMsg}
          </div>
        ) : null}

        <div
          className="relative shrink-0 p-3"
          style={{ borderTop: "1px solid rgb(var(--malv-border-rgb) / 0.08)", transition: "border-color 220ms ease" }}
          ref={profileCardRef}
        >
          {/* Account menu — opens above the card */}
          <AnimatePresence>
            {profileMenuOpen ? (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.97 }}
                transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
                className="absolute bottom-full left-3 right-3 mb-1.5 overflow-hidden rounded-xl"
                style={{
                  background: "rgb(var(--malv-surface-overlay-rgb))",
                  border: "1px solid rgb(var(--malv-border-rgb) / 0.12)",
                  boxShadow: "0 -8px 32px rgb(0 0 0 / 0.22)"
                }}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] transition-colors"
                  style={{ color: "rgb(var(--malv-text-rgb) / 0.8)" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgb(var(--malv-text-rgb) / 0.05)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                  onClick={() => {
                    setProfileMenuOpen(false);
                    closeMobile();
                    navigate("/app/settings");
                  }}
                >
                  <Settings className="h-4 w-4 shrink-0 opacity-60" />
                  Settings
                </button>
                <div className="mx-3 h-px" style={{ background: "rgb(var(--malv-border-rgb) / 0.08)" }} />
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] transition-colors"
                  style={{ color: "rgb(var(--malv-text-rgb) / 0.7)" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgb(var(--malv-text-rgb) / 0.05)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                  onClick={() => {
                    setProfileMenuOpen(false);
                    logout("user-initiated");
                  }}
                >
                  <LogOut className="h-4 w-4 shrink-0 opacity-60" />
                  Sign out
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors"
            style={{ background: "rgb(var(--malv-surface-raised-rgb))", transition: "background-color 180ms ease" }}
            aria-label="Account menu"
            aria-expanded={profileMenuOpen}
            onClick={() => setProfileMenuOpen((v) => !v)}
            onMouseEnter={(e) => {
              if (!profileMenuOpen) (e.currentTarget as HTMLButtonElement).style.background = "rgb(var(--malv-surface-overlay-rgb))";
            }}
            onMouseLeave={(e) => {
              if (!profileMenuOpen) (e.currentTarget as HTMLButtonElement).style.background = "rgb(var(--malv-surface-raised-rgb))";
            }}
          >
            <div className="relative shrink-0">
              <div className="relative h-8 w-8 rounded-full border border-white/[0.12]"
                style={{ background: "linear-gradient(160deg, oklch(0.16 0.03 255 / 0.95), oklch(0.1 0.016 262 / 0.95))" }}
              >
                <div className="flex h-full w-full items-center justify-center">
                  <span className="text-[12px] font-semibold tracking-wide text-malv-text/90">{userInitial}</span>
                </div>
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-[rgb(var(--malv-surface-base-rgb))] bg-malv-f-live shadow-[0_0_8px_rgb(var(--malv-f-live-rgb)/0.45)]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-malv-text">{displayName}</p>
              <p className="truncate text-[11px] text-malv-text/40">{secondaryLabel}</p>
            </div>
            <motion.div
              animate={{ rotate: profileMenuOpen ? 180 : 0 }}
              transition={{ duration: 0.18 }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-malv-text/35">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </motion.div>
          </button>
        </div>
      </motion.aside>
    </>
  );
}
