import { useState, useRef, useEffect, useMemo, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  Mic,
  Video,
  Bot,
  CheckSquare,
  Settings,
  Plus,
  Send,
  Paperclip,
  PhoneOff,
  VideoOff,
  MicOff,
  X,
  Menu,
  Sparkles,
  Copy,
  Check,
  Phone,
  Search,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { MALVPresence } from "./malv/presence";
import type { PresenceState, PresenceVariant } from "./malv/types";

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  quickActions?: string[];
  hasCode?: boolean;
};

type RecentChatRow = {
  id: string;
  title: string;
  date: string;
  active?: boolean;
  /** Used to group into Today / Yesterday / Earlier; omit or 0 to list under “Conversations”. */
  updatedAt?: number;
};

type NavId = "chats" | "voice" | "video" | "tasks";

type NavItem = { id: NavId; icon: LucideIcon; label: string; badge?: number };

const navItems: NavItem[] = [
  { id: "chats", icon: MessageSquare, label: "Chats" },
  { id: "voice", icon: Mic, label: "Voice" },
  { id: "video", icon: Video, label: "Video" },
  { id: "tasks", icon: CheckSquare, label: "Tasks" },
];

const AGENT_OPTIONS = [{ id: "default", label: "Default agent" }] as const;

function groupRecentChats(rows: RecentChatRow[]): { heading: string; chats: RecentChatRow[] }[] {
  if (rows.length === 0) return [];

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  const sorted = [...rows].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

  const today: RecentChatRow[] = [];
  const yesterday: RecentChatRow[] = [];
  const earlier: RecentChatRow[] = [];
  const undated: RecentChatRow[] = [];

  for (const r of sorted) {
    const ts = r.updatedAt;
    if (ts == null || ts === 0) {
      undated.push(r);
      continue;
    }
    const d = new Date(ts);
    if (d >= startOfToday) today.push(r);
    else if (d >= startOfYesterday) yesterday.push(r);
    else earlier.push(r);
  }

  const groups: { heading: string; chats: RecentChatRow[] }[] = [];
  if (today.length) groups.push({ heading: "Today", chats: today });
  if (yesterday.length) groups.push({ heading: "Yesterday", chats: yesterday });
  if (earlier.length) groups.push({ heading: "Earlier", chats: earlier });
  if (undated.length) groups.push({ heading: "Conversations", chats: undated });

  return groups.length ? groups : [{ heading: "Conversations", chats: rows }];
}

// ============================================
// PRESENCE VARIANT SELECTOR
// ============================================

const audioVariants: PresenceVariant[] = ['pulse', 'orb', 'halo'];
const videoVariants: PresenceVariant[] = ['holographic', 'neural', 'shell'];

// ============================================
// CODE BLOCK
// ============================================

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-border bg-background/50">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-secondary/30">
        <span className="text-xs font-medium text-muted-foreground">typescript</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-xs leading-relaxed">
        <code className="text-[var(--malv-cyan)]">{code}</code>
      </pre>
    </div>
  );
}

// ============================================
// MESSAGE COMPONENTS
// ============================================

function UserMessage({ content, timestamp }: { content: string; timestamp: string }) {
  return (
    <motion.div
      className="flex justify-end px-3 sm:px-0"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="max-w-[88%] sm:max-w-[78%] lg:max-w-[65%]">
        <div className="px-4 py-3 rounded-2xl rounded-br-md bg-primary text-primary-foreground">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5 text-right pr-1">{timestamp}</p>
      </div>
    </motion.div>
  );
}

function AssistantMessage({
  content,
  timestamp,
  quickActions,
  hasCode,
}: {
  content: string;
  timestamp: string;
  quickActions?: string[];
  hasCode?: boolean;
}) {
  const renderContent = () => {
    if (!hasCode) {
      return content.split("\n").map((line, i) => {
        if (line.startsWith("**") && line.endsWith("**")) {
          return (
            <p key={i} className="font-semibold mt-3 mb-1 text-foreground">
              {line.replace(/\*\*/g, "")}
            </p>
          );
        }
        if (line.startsWith("- ")) {
          return (
            <p key={i} className="ml-2 text-sm leading-relaxed">
              {line}
            </p>
          );
        }
        return (
          <p key={i} className="text-sm leading-relaxed">
            {line}
          </p>
        );
      });
    }

    const parts = content.split("```");
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        const lines = part.split("\n");
        const code = lines.slice(1).join("\n");
        return <CodeBlock key={i} code={code} />;
      }
      return part.split("\n").map((line, j) => (
        <p key={`${i}-${j}`} className="text-sm leading-relaxed">
          {line}
        </p>
      ));
    });
  };

  return (
    <motion.div
      className="flex justify-start px-3 sm:px-0"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="max-w-[95%] sm:max-w-[85%] lg:max-w-[75%]">
        <div className="flex items-start gap-2 sm:gap-3">
          <div className="relative shrink-0 mt-1">
            <div
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, oklch(0.7 0.18 200 / 0.15), oklch(0.6 0.2 280 / 0.15))",
                border: "1px solid oklch(0.3 0.04 260 / 0.4)",
              }}
            >
              <Sparkles className="w-4 h-4" style={{ color: "oklch(0.7 0.18 200)" }} />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div
              className="px-4 py-3 rounded-2xl rounded-tl-md"
              style={{
                background: "oklch(0.12 0.02 260 / 0.7)",
                border: "1px solid oklch(0.22 0.03 260 / 0.5)",
              }}
            >
              {renderContent()}
            </div>
            {quickActions && (
              <div className="flex flex-wrap gap-2 mt-2">
                {quickActions.map((action) => (
                  <motion.button
                    key={action}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {action}
                  </motion.button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1.5 ml-1">{timestamp}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================
// SIDEBAR
// ============================================

function Sidebar({
  activeNav,
  setActiveNav,
  isOpen,
  onClose,
  recentChats,
  onOpenVoice,
  onOpenVideo,
}: {
  activeNav: string;
  setActiveNav: (nav: string) => void;
  isOpen: boolean;
  onClose: () => void;
  recentChats: RecentChatRow[];
  onOpenVoice: () => void;
  onOpenVideo: () => void;
}) {
  const navigate = useNavigate();
  const chatGroups = useMemo(() => groupRecentChats(recentChats), [recentChats]);

  const openSettings = () => {
    navigate("/app/settings");
    onClose();
  };

  const handleShortcutClick = (item: NavItem) => {
    if (item.id === "chats") {
      setActiveNav("Chats");
      onClose();
      return;
    }
    if (item.id === "voice") {
      onOpenVoice();
      onClose();
      return;
    }
    if (item.id === "video") {
      onOpenVideo();
      onClose();
    }
  };

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Sidebar: flex column so chat history gets a dedicated scroll region */}
      <motion.aside
        className={`fixed inset-y-0 left-0 z-50 flex h-[100dvh] max-h-[100dvh] w-[min(100vw-2.5rem,18rem)] flex-col border-r border-sidebar-border bg-sidebar sm:w-72 lg:static lg:h-full lg:max-h-none lg:min-h-0 lg:w-64 ${
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } transition-transform lg:transition-none`}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between p-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] lg:pt-4">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{
                background: "linear-gradient(135deg, oklch(0.7 0.18 200), oklch(0.6 0.2 280))",
              }}
            >
              <Sparkles className="h-[1.125rem] w-[1.125rem] text-background" />
            </div>
            <span className="text-lg font-semibold tracking-tight">MALV</span>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 hover:bg-secondary lg:hidden">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* New Chat */}
        <div className="mb-2 shrink-0 px-3">
          <motion.button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium"
            style={{
              background: "oklch(0.7 0.18 200)",
              color: "oklch(0.08 0.015 260)",
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Plus className="h-4 w-4" />
            New Chat
          </motion.button>
        </div>

        {/* Search */}
        <div className="mb-2 shrink-0 px-3">
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{ background: "oklch(0.12 0.02 260)" }}
          >
            <Search className="h-4 w-4 shrink-0" style={{ color: "oklch(0.5 0.02 260)" }} />
            <input
              type="search"
              placeholder="Search chats…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              enterKeyHint="search"
            />
          </div>
        </div>

        {/* Shortcuts (no Vault, Files, Analytics, Agents, Memory, Settings) */}
        <nav className="mb-2 shrink-0 px-3" aria-label="Workspace shortcuts">
          <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Shortcuts
          </p>
          <div className="space-y-0.5">
            {navItems.map((item) => {
              const persistActive =
                (item.id === "chats" && activeNav === "Chats") ||
                (item.id === "tasks" && activeNav === "Tasks");

              if (item.id === "tasks") {
                return (
                  <Link
                    key={item.id}
                    to="/app/beast"
                    onClick={() => {
                      setActiveNav("Tasks");
                      onClose();
                    }}
                    className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                      persistActive
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                    }`}
                  >
                    {persistActive && (
                      <motion.div
                        className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r bg-primary"
                        layoutId="activeNav"
                      />
                    )}
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left">{item.label}</span>
                  </Link>
                );
              }

              return (
                <motion.button
                  key={item.id}
                  type="button"
                  onClick={() => handleShortcutClick(item)}
                  className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    persistActive
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  }`}
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {persistActive && (
                    <motion.div
                      className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r bg-primary"
                      layoutId="activeNav"
                    />
                  )}
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                </motion.button>
              );
            })}
          </div>
        </nav>

        <div className="shrink-0 px-3">
          <div className="h-px" style={{ background: "oklch(0.2 0.025 260)" }} />
        </div>

        {/* Chat history: fills remaining space, scrolls independently */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pt-3">
          <div className="mb-2 flex shrink-0 items-center justify-between gap-2 px-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Chat history
            </p>
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] pr-0.5"
            role="list"
            aria-label="Recent conversations"
          >
            {recentChats.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs leading-relaxed text-muted-foreground">
                No conversations yet. New chats will appear here.
              </p>
            ) : (
              <div className="space-y-4 pb-2">
                {chatGroups.map((group) => (
                  <div key={group.heading}>
                    <p className="sticky top-0 z-[1] mb-1.5 bg-sidebar px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/90">
                      {group.heading}
                    </p>
                    <ul className="space-y-0.5">
                      {group.chats.map((conv) => (
                        <li key={conv.id}>
                          <button
                            type="button"
                            className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
                              conv.active
                                ? "bg-secondary text-foreground ring-1 ring-inset ring-primary/25"
                                : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                            }`}
                          >
                            <p className="truncate text-sm font-medium leading-snug">{conv.title}</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">{conv.date}</p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Account → Settings (Memory lives in Settings) */}
        <div className="shrink-0 border-t border-sidebar-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={openSettings}
            className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-secondary/50"
            style={{ background: "oklch(0.1 0.018 260)" }}
          >
            <div className="relative shrink-0">
              <div
                className="h-9 w-9 rounded-full"
                style={{
                  background: "linear-gradient(135deg, oklch(0.6 0.2 280), oklch(0.5 0.18 300))",
                }}
              />
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-sidebar bg-emerald-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">Account</p>
              <p className="truncate text-[11px] text-muted-foreground">Settings & memory</p>
            </div>
            <Settings className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        </div>
      </motion.aside>
    </>
  );
}

// ============================================
// VOICE CALL PANEL (FULLSCREEN) - WITH MODULAR PRESENCE
// ============================================

function VoiceCallPanel({ onEnd }: { onEnd: () => void }) {
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [duration, setDuration] = useState(0);
  const [currentVariant, setCurrentVariant] = useState<PresenceVariant>("pulse");

  useEffect(() => {
    const interval = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const callPresenceState: PresenceState = isMuted ? "muted" : "idle";

  const getStatusLabel = () => (isMuted ? "Muted" : "Voice active");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-y-auto overflow-x-hidden p-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:p-6"
      style={{
        background: "linear-gradient(180deg, oklch(0.06 0.02 210), oklch(0.04 0.015 220))",
      }}
    >
      {/* Background glow */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(circle at 50% 40%, oklch(0.7 0.18 200 / 0.12) 0%, transparent 55%)",
        }}
      />

      {/* Header */}
      <div className="absolute top-6 sm:top-8 left-0 right-0 flex flex-col items-center z-10 px-4">
        <div className="mb-2 flex items-center gap-2">
          <motion.div
            className="h-2 w-2 rounded-full"
            style={{ background: "oklch(0.7 0.2 145)" }}
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "oklch(0.7 0.18 200)" }}>
            Voice Call
          </span>
        </div>
        <span className="text-xl font-bold sm:text-2xl">MALV AI</span>
        <div className="mt-1.5 flex items-center gap-3">
          <span className="font-mono text-sm text-muted-foreground">{formatDuration(duration)}</span>
        </div>
      </div>

      {/* Variant Selector */}
      <div className="absolute left-1/2 top-[5.5rem] z-10 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 px-2 sm:top-28 sm:max-w-none">
        {audioVariants.map((variant) => (
          <motion.button
            key={variant}
            onClick={() => setCurrentVariant(variant)}
            className="px-3 py-1 rounded-full text-xs font-medium capitalize"
            style={{
              background: currentVariant === variant ? 'oklch(0.7 0.18 200)' : 'oklch(0.15 0.025 260)',
              color: currentVariant === variant ? 'oklch(0.08 0.015 260)' : 'oklch(0.6 0.02 260)',
              border: `1px solid ${currentVariant === variant ? 'oklch(0.7 0.18 200)' : 'oklch(0.25 0.03 260)'}`,
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {variant}
          </motion.button>
        ))}
      </div>

      {/* MALV Presence */}
      <MALVPresence
        variant={currentVariant}
        state={callPresenceState}
        audioLevel={0}
        className="h-48 w-48 sm:h-64 sm:w-64"
      />

      {/* Status label */}
      <motion.div
        className="mt-6 sm:mt-8"
        key={isMuted ? "muted" : "active"}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div
          className="px-4 py-1.5 rounded-full text-xs font-medium"
          style={{
            background: 'oklch(0.15 0.025 260 / 0.9)',
            border: '1px solid oklch(0.3 0.05 200 / 0.5)',
            color: 'oklch(0.75 0.15 200)',
          }}
        >
          {getStatusLabel()}
        </div>
      </motion.div>

      {/* Level meter placeholder (wire to real audio when available) */}
      <div className="mt-5 flex h-8 items-center justify-center gap-0.5">
        {Array.from({ length: 24 }).map((_, i) => (
          <div
            key={i}
            className="h-1 w-1 rounded-full opacity-20"
            style={{
              background:
                "linear-gradient(180deg, oklch(0.7 0.18 200) 0%, oklch(0.5 0.15 220) 100%)",
            }}
          />
        ))}
      </div>

      {/* Controls */}
      <div className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 flex -translate-x-1/2 items-center gap-3 sm:bottom-12 sm:gap-5">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsSpeakerOn(!isSpeakerOn)}
          className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center"
          style={{
            background: !isSpeakerOn ? "oklch(0.55 0.22 25)" : "oklch(0.18 0.03 260)",
            border: "1px solid oklch(0.28 0.04 260)",
          }}
        >
          {isSpeakerOn ? <Volume2 className="w-5 h-5 sm:w-6 sm:h-6" /> : <VolumeX className="w-5 h-5 sm:w-6 sm:h-6" />}
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsMuted(!isMuted)}
          className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center"
          style={{
            background: isMuted ? "oklch(0.55 0.22 25)" : "oklch(0.18 0.03 260)",
            border: "1px solid oklch(0.28 0.04 260)",
          }}
        >
          {isMuted ? <MicOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Mic className="w-5 h-5 sm:w-6 sm:h-6" />}
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={onEnd}
          className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, oklch(0.55 0.22 25), oklch(0.45 0.2 20))",
            boxShadow: "0 0 40px oklch(0.55 0.22 25 / 0.5)",
          }}
        >
          <PhoneOff className="w-6 h-6 sm:w-7 sm:h-7" />
        </motion.button>
      </div>
    </motion.div>
  );
}

// ============================================
// VIDEO CALL PANEL (FULLSCREEN) - WITH MODULAR PRESENCE
// ============================================

function VideoCallPanel({ onEnd }: { onEnd: () => void }) {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentVariant, setCurrentVariant] = useState<PresenceVariant>("holographic");

  useEffect(() => {
    const interval = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const videoPresenceState: PresenceState = isVideoOff ? "muted" : "idle";

  const getStatusLabel = () => (isVideoOff ? "Video paused" : "Video active");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-y-auto overflow-x-hidden p-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:p-6"
      style={{
        background: "linear-gradient(180deg, oklch(0.05 0.02 280), oklch(0.03 0.015 260))",
      }}
    >
      {/* Background glow */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(circle at 50% 40%, oklch(0.6 0.2 280 / 0.15) 0%, transparent 55%)",
        }}
      />

      {/* Subtle scan lines */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, oklch(1 0 0 / 0.15) 2px, oklch(1 0 0 / 0.15) 4px)",
        }}
      />

      {/* Header */}
      <div className="absolute top-6 sm:top-8 left-0 right-0 flex flex-col items-center z-10 px-4">
        <div className="flex items-center gap-2 mb-2">
          <motion.span
            className="w-2 h-2 rounded-full"
            style={{ background: "oklch(0.65 0.22 25)" }}
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
          <span className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: "oklch(0.6 0.2 280)" }}>
            Video Call
          </span>
        </div>
        <span className="text-xl font-bold sm:text-2xl">MALV AI</span>
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">{formatDuration(duration)}</span>
        </div>
      </div>

      {/* Variant Selector */}
      <div className="absolute left-1/2 top-[6.5rem] z-10 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 px-2 sm:top-32 sm:max-w-none">
        {videoVariants.map((variant) => (
          <motion.button
            key={variant}
            onClick={() => setCurrentVariant(variant)}
            className="px-3 py-1 rounded-full text-xs font-medium capitalize"
            style={{
              background: currentVariant === variant ? 'oklch(0.6 0.2 280)' : 'oklch(0.15 0.025 260)',
              color: currentVariant === variant ? 'oklch(0.98 0.01 260)' : 'oklch(0.6 0.02 260)',
              border: `1px solid ${currentVariant === variant ? 'oklch(0.6 0.2 280)' : 'oklch(0.25 0.03 260)'}`,
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {variant}
          </motion.button>
        ))}
      </div>

      {/* MALV Presence */}
      <MALVPresence
        variant={currentVariant}
        state={videoPresenceState}
        audioLevel={0}
        className="h-52 w-52 sm:h-72 sm:w-72"
      />

      {/* Status label */}
      <motion.div
        className="mt-6 sm:mt-8"
        key={isVideoOff ? "off" : "on"}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div
          className="rounded-full px-4 py-1.5 text-xs font-medium"
          style={{
            background: "oklch(0.15 0.025 260 / 0.9)",
            border: "1px solid oklch(0.35 0.08 280 / 0.5)",
            color: "oklch(0.75 0.15 280)",
          }}
        >
          {getStatusLabel()}
        </div>
      </motion.div>

      {/* Self preview */}
      <motion.div
        className="absolute bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-3 h-24 w-[4.5rem] overflow-hidden rounded-xl sm:bottom-32 sm:right-6 sm:h-36 sm:w-28"
        style={{
          background: "linear-gradient(135deg, oklch(0.15 0.02 260), oklch(0.1 0.015 260))",
          border: "2px solid oklch(0.25 0.03 260)",
          boxShadow: "0 8px 32px oklch(0 0 0 / 0.4)",
        }}
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-violet-500/30 to-cyan-500/30 flex items-center justify-center">
            <span className="text-base sm:text-lg font-medium text-foreground/60">You</span>
          </div>
        </div>
        {/* Camera frame corners */}
        <div className="absolute top-1 left-1 w-3 h-3 border-t-2 border-l-2 border-cyan-400/50 rounded-tl" />
        <div className="absolute top-1 right-1 w-3 h-3 border-t-2 border-r-2 border-cyan-400/50 rounded-tr" />
        <div className="absolute bottom-1 left-1 w-3 h-3 border-b-2 border-l-2 border-cyan-400/50 rounded-bl" />
        <div className="absolute bottom-1 right-1 w-3 h-3 border-b-2 border-r-2 border-cyan-400/50 rounded-br" />
      </motion.div>

      {/* Controls */}
      <div className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 flex -translate-x-1/2 items-center gap-2 sm:bottom-12 sm:gap-4">
        <motion.button
          whileHover={{ scale: 1.1, boxShadow: '0 0 20px oklch(0.7 0.18 200 / 0.3)' }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsMuted(!isMuted)}
          className="w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center"
          style={{
            background: isMuted ? "oklch(0.55 0.22 25)" : "oklch(0.18 0.03 260)",
            border: "1px solid oklch(0.28 0.04 260)",
          }}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.1, boxShadow: '0 0 20px oklch(0.6 0.2 280 / 0.3)' }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsVideoOff(!isVideoOff)}
          className="w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center"
          style={{
            background: isVideoOff ? "oklch(0.55 0.22 25)" : "oklch(0.18 0.03 260)",
            border: "1px solid oklch(0.28 0.04 260)",
          }}
        >
          {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={onEnd}
          className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, oklch(0.55 0.22 25), oklch(0.45 0.2 20))",
            boxShadow: "0 0 40px oklch(0.55 0.22 25 / 0.5)",
          }}
        >
          <PhoneOff className="w-6 h-6 sm:w-7 sm:h-7" />
        </motion.button>
      </div>
    </motion.div>
  );
}

// ============================================
// MAIN PAGE
// ============================================

export function MalvDashboardShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("Chats");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const recentChats: RecentChatRow[] = [];
  const [input, setInput] = useState("");
  const [isVoiceCallActive, setIsVoiceCallActive] = useState(false);
  const [isVideoCallActive, setIsVideoCallActive] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(AGENT_OPTIONS[0].id);
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const agentMenuRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!agentMenuOpen) return;
    const onDocDown = (e: MouseEvent) => {
      if (agentMenuRef.current?.contains(e.target as Node)) return;
      setAgentMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [agentMenuOpen]);

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: "user",
      content: input.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className="flex h-[100dvh] min-h-0 max-h-[100dvh] overflow-hidden overscroll-none"
      style={{ background: "oklch(0.08 0.015 260)" }}
    >
      {/* Sidebar */}
      <Sidebar
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        recentChats={recentChats}
        onOpenVoice={() => setIsVoiceCallActive(true)}
        onOpenVideo={() => setIsVideoCallActive(true)}
      />

      {/* Main Content */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Header */}
        <header
          className="shrink-0 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4"
          style={{
            background: "oklch(0.08 0.015 260)",
            borderBottom: "1px solid oklch(0.18 0.025 260)",
          }}
        >
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="shrink-0 rounded-lg p-2 hover:bg-secondary lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>

              <div className="flex min-w-0 items-center gap-2.5">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg lg:hidden"
                  style={{
                    background: "linear-gradient(135deg, oklch(0.7 0.18 200), oklch(0.6 0.2 280))",
                  }}
                >
                  <Sparkles className="h-4 w-4 text-background" />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-base font-semibold">MALV Assistant</h1>
                  <div className="flex items-center gap-2">
                    <motion.div
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: "oklch(0.7 0.2 145)" }}
                      animate={{ opacity: [1, 0.5, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                    <span className="text-[11px]" style={{ color: "oklch(0.55 0.02 260)" }}>
                      Online
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
              <div className="relative" ref={agentMenuRef}>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setAgentMenuOpen((o) => !o)}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-secondary ${
                    agentMenuOpen ? "bg-secondary" : ""
                  }`}
                  aria-label="Agent"
                  aria-expanded={agentMenuOpen}
                  aria-haspopup="listbox"
                >
                  <Bot className="h-[1.125rem] w-[1.125rem]" style={{ color: "oklch(0.62 0.18 280)" }} />
                </motion.button>
                <AnimatePresence>
                  {agentMenuOpen && (
                    <motion.div
                      role="listbox"
                      aria-label="Choose agent"
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-[calc(100%+0.35rem)] z-50 min-w-[12rem] overflow-hidden rounded-xl border py-1 shadow-xl ring-1 ring-black/20"
                      style={{
                        background: "oklch(0.11 0.02 260)",
                        borderColor: "oklch(0.24 0.03 260)",
                      }}
                    >
                      <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Agent
                      </p>
                      {AGENT_OPTIONS.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          role="option"
                          aria-selected={selectedAgentId === o.id}
                          onClick={() => {
                            setSelectedAgentId(o.id);
                            setAgentMenuOpen(false);
                          }}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-secondary/80"
                        >
                          <span className="font-medium">{o.label}</span>
                          {selectedAgentId === o.id ? (
                            <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                          ) : null}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <motion.button
                type="button"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsVoiceCallActive(true)}
                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-secondary"
                aria-label="Voice call"
              >
                <Phone className="h-[1.125rem] w-[1.125rem]" style={{ color: "oklch(0.7 0.18 200)" }} />
              </motion.button>
              <motion.button
                type="button"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsVideoCallActive(true)}
                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-secondary"
                aria-label="Video call"
              >
                <Video className="h-[1.125rem] w-[1.125rem]" style={{ color: "oklch(0.6 0.2 280)" }} />
              </motion.button>
            </div>
          </div>
        </header>

        {/* Messages Area */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [-webkit-overflow-scrolling:touch]">
          <div className="mx-auto max-w-3xl space-y-5 px-2 pb-6 pt-4 sm:px-4 sm:py-6 sm:pb-8">
            {messages.length === 0 ? (
              <div className="flex min-h-[min(60dvh,28rem)] flex-col items-center justify-center py-8 sm:py-12">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
                  style={{
                    background: "linear-gradient(135deg, oklch(0.7 0.18 200 / 0.15), oklch(0.6 0.2 280 / 0.15))",
                    border: "1px solid oklch(0.3 0.04 260 / 0.4)",
                  }}
                >
                  <Sparkles className="w-8 h-8" style={{ color: "oklch(0.7 0.18 200)" }} />
                </div>
                <h2 className="mb-2 text-xl font-semibold">How can I help you today?</h2>
                <p className="max-w-sm text-center text-sm text-muted-foreground">
                  Start a conversation below. Connect your backend to stream real assistant replies.
                </p>
              </div>
            ) : (
              <>
                {messages.map((msg) =>
                  msg.role === "user" ? (
                    <UserMessage key={msg.id} content={msg.content} timestamp={msg.timestamp} />
                  ) : (
                    <AssistantMessage
                      key={msg.id}
                      content={msg.content}
                      timestamp={msg.timestamp}
                      quickActions={msg.quickActions}
                      hasCode={msg.hasCode}
                    />
                  )
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div
          className="shrink-0 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-4"
          style={{
            background: "oklch(0.08 0.015 260)",
            borderTop: "1px solid oklch(0.18 0.025 260)",
          }}
        >
          <div className="mx-auto max-w-3xl">
            <div
              className="relative overflow-hidden rounded-2xl transition-shadow focus-within:ring-2 focus-within:ring-primary/25"
              style={{
                background: "oklch(0.12 0.02 260)",
                border: "1px solid oklch(0.22 0.03 260)",
              }}
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
                }}
                onKeyDown={handleKeyDown}
                placeholder="Message MALV..."
                rows={1}
                className="w-full min-h-[44px] resize-none bg-transparent py-3 pl-3 pr-[6.5rem] text-sm placeholder:text-muted-foreground focus:outline-none sm:px-4 sm:pr-28"
                style={{ maxHeight: "140px" }}
              />
              <div className="absolute bottom-2 right-1.5 flex items-center gap-0.5 sm:right-2 sm:gap-1">
                <motion.button
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Paperclip className="w-4 h-4" />
                </motion.button>
                <motion.button
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Mic className="w-4 h-4" />
                </motion.button>
                <motion.button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="rounded-lg p-2 disabled:opacity-40"
                  style={{
                    background: input.trim() ? "oklch(0.7 0.18 200)" : "oklch(0.2 0.03 260)",
                    color: input.trim() ? "oklch(0.08 0.015 260)" : "oklch(0.5 0.02 260)",
                  }}
                  whileHover={input.trim() ? { scale: 1.05 } : {}}
                  whileTap={input.trim() ? { scale: 0.95 } : {}}
                >
                  <Send className="w-4 h-4" />
                </motion.button>
              </div>
            </div>
            <p className="mt-2 text-center text-[11px]" style={{ color: "oklch(0.4 0.02 260)" }}>
              MALV may produce inaccurate information. Always verify important facts.
            </p>
          </div>
        </div>
      </main>

      {/* Voice Call Overlay */}
      <AnimatePresence>
        {isVoiceCallActive && <VoiceCallPanel onEnd={() => setIsVoiceCallActive(false)} />}
      </AnimatePresence>

      {/* Video Call Overlay */}
      <AnimatePresence>
        {isVideoCallActive && <VideoCallPanel onEnd={() => setIsVideoCallActive(false)} />}
      </AnimatePresence>
    </div>
  );
}
