"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  Mic,
  Video,
  FolderOpen,
  Shield,
  Bot,
  CheckSquare,
  Brain,
  BarChart3,
  Settings,
  Plus,
  Send,
  Paperclip,
  MoreHorizontal,
  PhoneOff,
  VideoOff,
  MicOff,
  X,
  Menu,
  ChevronDown,
  Sparkles,
  Zap,
  FileText,
  Code,
  Copy,
  Check,
  Phone,
  Search,
  Signal,
  Volume2,
  VolumeX,
} from "lucide-react";
import { MALVPresence } from "@/components/malv/presence";
import type { PresenceState, PresenceVariant } from "@/components/malv/types";

// ============================================
// MOCK DATA
// ============================================

const mockConversations = [
  { id: 1, title: "Project Alpha Analysis", date: "2 min ago", active: true },
  { id: 2, title: "Security Audit Report", date: "1 hour ago", active: false },
  { id: 3, title: "Voice Transcription", date: "Yesterday", active: false },
  { id: 4, title: "Code Review Session", date: "2 days ago", active: false },
  { id: 5, title: "Database Migration", date: "3 days ago", active: false },
  { id: 6, title: "API Integration", date: "4 days ago", active: false },
];

const mockMessages = [
  {
    id: 1,
    role: "assistant" as const,
    content:
      "Welcome back, Operator. I've analyzed the latest data from Project Alpha. Three anomalies detected in the neural pathway configurations. Shall I initiate deep-scan protocol?",
    timestamp: "10:32 AM",
  },
  {
    id: 2,
    role: "user" as const,
    content: "Yes, initiate the deep-scan. Also, prepare a summary of the Q4 performance metrics.",
    timestamp: "10:33 AM",
  },
  {
    id: 3,
    role: "assistant" as const,
    content:
      "Deep-scan initiated. ETA: 4 minutes.\n\nMeanwhile, here's your Q4 summary:\n\n**Performance Highlights:**\n- Processing efficiency: +23% YoY\n- Response latency: 12ms average\n- Uptime: 99.97%\n- Active operators: 1,247\n\nI've also identified three optimization opportunities that could improve throughput by an additional 15%.",
    timestamp: "10:33 AM",
    quickActions: ["View Details", "Export Report", "Schedule Review"],
  },
  {
    id: 4,
    role: "user" as const,
    content: "Show me the code for the optimization algorithm.",
    timestamp: "10:35 AM",
  },
  {
    id: 5,
    role: "assistant" as const,
    content:
      "Here's the core optimization algorithm:\n\n```typescript\ninterface OptimizationConfig {\n  threshold: number;\n  maxIterations: number;\n  learningRate: number;\n}\n\nasync function optimizePathways(\n  data: NeuralData[],\n  config: OptimizationConfig\n): Promise<OptimizationResult> {\n  const { threshold, maxIterations, learningRate } = config;\n  \n  let currentScore = calculateScore(data);\n  let iteration = 0;\n  \n  while (currentScore < threshold && iteration < maxIterations) {\n    const gradients = computeGradients(data);\n    data = applyGradients(data, gradients, learningRate);\n    currentScore = calculateScore(data);\n    iteration++;\n  }\n  \n  return {\n    optimizedData: data,\n    finalScore: currentScore,\n    iterations: iteration,\n  };\n}\n```\n\nThis algorithm uses gradient descent with adaptive learning rates for optimal convergence.",
    timestamp: "10:35 AM",
    hasCode: true,
  },
];

const navItems = [
  { icon: MessageSquare, label: "Chats", badge: 3 },
  { icon: Mic, label: "Voice" },
  { icon: Video, label: "Video" },
  { icon: FolderOpen, label: "Files", badge: 12 },
  { icon: Shield, label: "Vault" },
  { icon: Bot, label: "Agents" },
  { icon: CheckSquare, label: "Tasks", badge: 5 },
  { icon: Brain, label: "Memory" },
  { icon: BarChart3, label: "Analytics" },
  { icon: Settings, label: "Settings" },
];

const starterPrompts = [
  { icon: Zap, title: "Analyze data", desc: "Process and visualize datasets" },
  { icon: Code, title: "Write code", desc: "Generate and review code" },
  { icon: FileText, title: "Draft content", desc: "Create documents and reports" },
  { icon: Brain, title: "Brainstorm", desc: "Explore ideas and strategies" },
];

// ============================================
// PRESENCE VARIANT SELECTOR
// ============================================

const audioVariants: PresenceVariant[] = ['pulse', 'orb', 'halo'];
const videoVariants: PresenceVariant[] = ['holographic', 'neural', 'shell'];

// ============================================
// CHATGPT-STYLE THINKING TRANSCRIPT
// ============================================

function ThinkingTranscript({
  isComplete,
  streamText,
}: {
  isComplete: boolean;
  streamText: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [streamText]);

  if (isComplete) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="flex justify-start px-3 sm:px-0"
    >
      <div className="max-w-[95%] sm:max-w-[85%] lg:max-w-[75%]">
        <div className="flex items-start gap-2 sm:gap-3">
          {/* Avatar */}
          <div className="relative shrink-0 mt-1">
            <motion.div
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, oklch(0.7 0.18 200), oklch(0.6 0.2 280))",
              }}
              animate={{
                boxShadow: [
                  "0 0 0 0 oklch(0.7 0.18 200 / 0.3)",
                  "0 0 20px 4px oklch(0.7 0.18 200 / 0.15)",
                  "0 0 0 0 oklch(0.7 0.18 200 / 0.3)",
                ],
              }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <Sparkles className="w-4 h-4 text-background" />
            </motion.div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div
              className="px-4 py-3 rounded-2xl rounded-tl-md"
              style={{
                background: "oklch(0.11 0.02 260 / 0.85)",
                border: "1px solid oklch(0.22 0.03 260 / 0.6)",
              }}
            >
              {/* Header */}
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border/30">
                <motion.div
                  className="w-2 h-2 rounded-full"
                  style={{ background: "oklch(0.7 0.18 200)" }}
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 0.9, repeat: Infinity }}
                />
                <span className="text-xs font-medium" style={{ color: "oklch(0.7 0.18 200)" }}>
                  Thinking
                </span>
              </div>

              {/* Streaming text */}
              <div
                ref={containerRef}
                className="text-sm leading-relaxed overflow-y-auto max-h-28"
                style={{ color: "oklch(0.7 0.03 260)" }}
              >
                {streamText}
                <motion.span
                  className="inline-block w-0.5 h-4 ml-0.5 align-middle"
                  style={{ background: "oklch(0.7 0.18 200)" }}
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 0.6, repeat: Infinity }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

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
}: {
  activeNav: string;
  setActiveNav: (nav: string) => void;
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-72 lg:w-64 bg-sidebar border-r border-sidebar-border flex flex-col ${
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } transition-transform lg:transition-none`}
      >
        {/* Header */}
        <div className="p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, oklch(0.7 0.18 200), oklch(0.6 0.2 280))",
              }}
            >
              <Sparkles className="w-4.5 h-4.5 text-background" />
            </div>
            <span className="font-semibold text-lg tracking-tight">MALV</span>
          </div>
          <button onClick={onClose} className="lg:hidden p-1.5 hover:bg-secondary rounded-md">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* New Chat Button */}
        <div className="px-3 mb-3 shrink-0">
          <motion.button
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-medium text-sm"
            style={{
              background: "oklch(0.7 0.18 200)",
              color: "oklch(0.08 0.015 260)",
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Plus className="w-4 h-4" />
            New Chat
          </motion.button>
        </div>

        {/* Search */}
        <div className="px-3 mb-3 shrink-0">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: "oklch(0.12 0.02 260)" }}
          >
            <Search className="w-4 h-4" style={{ color: "oklch(0.5 0.02 260)" }} />
            <input
              type="text"
              placeholder="Search..."
              className="bg-transparent text-sm flex-1 outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Navigation - ABOVE Chat History */}
        <nav className="px-3 mb-3 shrink-0">
          <p className="px-2 mb-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            Menu
          </p>
          <div className="space-y-0.5">
            {navItems.map((item) => {
              const isActive = activeNav === item.label;
              return (
                <motion.button
                  key={item.label}
                  onClick={() => setActiveNav(item.label)}
                  className={`relative w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? "text-foreground bg-secondary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`}
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {isActive && (
                    <motion.div
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-primary rounded-r"
                      layoutId="activeNav"
                    />
                  )}
                  <item.icon className="w-4 h-4" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.badge && (
                    <span className="px-1.5 py-0.5 rounded-md bg-primary/20 text-primary text-[10px] font-medium">
                      {item.badge}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </nav>

        {/* Divider */}
        <div className="px-3 shrink-0">
          <div className="h-px" style={{ background: "oklch(0.2 0.025 260)" }} />
        </div>

        {/* Recent Chats - SCROLLABLE SECTION */}
        <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0">
          <div className="flex items-center justify-between mb-2">
            <p className="px-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Recent
            </p>
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          </div>
          <div className="space-y-0.5">
            {mockConversations.map((conv) => (
              <button
                key={conv.id}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  conv.active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                <p className="truncate font-medium">{conv.title}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{conv.date}</p>
              </button>
            ))}
          </div>
        </div>

        {/* User Profile Card */}
        <div className="p-3 border-t border-sidebar-border shrink-0">
          <div
            className="flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-colors hover:bg-secondary/50"
            style={{ background: "oklch(0.1 0.018 260)" }}
          >
            <div className="relative">
              <div
                className="w-9 h-9 rounded-full"
                style={{
                  background: "linear-gradient(135deg, oklch(0.6 0.2 280), oklch(0.5 0.18 300))",
                }}
              />
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-sidebar" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Alex Chen</p>
              <p className="text-[11px] text-muted-foreground truncate">Operator Mode</p>
            </div>
            <MoreHorizontal className="w-4 h-4 text-muted-foreground shrink-0" />
          </div>
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
  const [presenceState, setPresenceState] = useState<PresenceState>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [currentVariant, setCurrentVariant] = useState<PresenceVariant>('pulse');

  useEffect(() => {
    const interval = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Simulate AI states cycling
  useEffect(() => {
    const states: PresenceState[] = ['listening', 'thinking', 'speaking', 'idle'];
    let index = 0;
    const interval = setInterval(() => {
      if (!isMuted) {
        setPresenceState(states[index % states.length]);
        index++;
      }
    }, 3500);
    return () => clearInterval(interval);
  }, [isMuted]);

  // Simulate audio levels when speaking
  useEffect(() => {
    if (presenceState === 'speaking') {
      const interval = setInterval(() => {
        setAudioLevel(Math.random() * 0.8 + 0.2);
      }, 100);
      return () => clearInterval(interval);
    } else {
      setAudioLevel(0);
    }
  }, [presenceState]);

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getStatusLabel = () => {
    if (isMuted) return 'Muted';
    switch (presenceState) {
      case 'listening': return 'Listening';
      case 'thinking': return 'Processing';
      case 'speaking': return 'Responding';
      default: return 'Voice Active';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 sm:p-6"
      style={{
        background: "linear-gradient(180deg, oklch(0.06 0.02 210), oklch(0.04 0.015 220))",
      }}
    >
      {/* Background glow */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(circle at 50% 40%, oklch(0.7 0.18 200 / 0.12) 0%, transparent 55%)",
        }}
        animate={{
          opacity: presenceState === 'speaking' ? [0.8, 1, 0.8] : 1,
        }}
        transition={{ duration: 1.5, repeat: Infinity }}
      />

      {/* Header */}
      <div className="absolute top-6 sm:top-8 left-0 right-0 flex flex-col items-center z-10 px-4">
        <div className="flex items-center gap-2 mb-2">
          <motion.div
            className="w-2 h-2 rounded-full"
            style={{ background: "oklch(0.7 0.2 145)" }}
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
          <span className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: "oklch(0.7 0.18 200)" }}>
            Voice Call
          </span>
        </div>
        <span className="text-xl sm:text-2xl font-bold">MALV AI</span>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-sm text-muted-foreground font-mono">{formatDuration(duration)}</span>
          <div className="flex items-center gap-1.5 text-xs text-emerald-400">
            <Signal className="w-3 h-3" />
            <span>Stable</span>
          </div>
        </div>
      </div>

      {/* Variant Selector */}
      <div className="absolute top-24 sm:top-28 flex items-center gap-2">
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
        state={isMuted ? 'muted' : presenceState}
        audioLevel={audioLevel}
        className="w-48 h-48 sm:w-64 sm:h-64"
      />

      {/* Status label */}
      <motion.div
        className="mt-6 sm:mt-8"
        key={presenceState}
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

      {/* Audio waveform */}
      <div className="flex items-center justify-center gap-0.5 mt-5 h-8">
        {Array.from({ length: 24 }).map((_, i) => (
          <motion.div
            key={i}
            className="w-1 rounded-full"
            style={{
              background: 'linear-gradient(180deg, oklch(0.7 0.18 200) 0%, oklch(0.5 0.15 220) 100%)',
            }}
            animate={{
              height: presenceState === 'speaking' || presenceState === 'listening'
                ? [4, 8 + Math.random() * 16, 4]
                : 4,
              opacity: presenceState === 'speaking' || presenceState === 'listening'
                ? [0.3, 0.7, 0.3]
                : 0.2,
            }}
            transition={{
              duration: 0.25 + Math.random() * 0.2,
              repeat: Infinity,
              delay: i * 0.025,
            }}
          />
        ))}
      </div>

      {/* Controls */}
      <div className="absolute bottom-10 sm:bottom-12 flex items-center gap-4 sm:gap-5">
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
  const [presenceState, setPresenceState] = useState<PresenceState>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [currentVariant, setCurrentVariant] = useState<PresenceVariant>('holographic');

  useEffect(() => {
    const interval = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Simulate AI states cycling
  useEffect(() => {
    const states: PresenceState[] = ['listening', 'thinking', 'speaking', 'idle'];
    let index = 0;
    const interval = setInterval(() => {
      if (!isVideoOff) {
        setPresenceState(states[index % states.length]);
        index++;
      }
    }, 3500);
    return () => clearInterval(interval);
  }, [isVideoOff]);

  // Simulate audio levels when speaking
  useEffect(() => {
    if (presenceState === 'speaking') {
      const interval = setInterval(() => {
        setAudioLevel(Math.random() * 0.8 + 0.2);
      }, 100);
      return () => clearInterval(interval);
    } else {
      setAudioLevel(0);
    }
  }, [presenceState]);

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getStatusLabel = () => {
    if (isVideoOff) return 'Video Paused';
    switch (presenceState) {
      case 'listening': return 'Observing';
      case 'thinking': return 'Analyzing';
      case 'speaking': return 'Presenting';
      default: return 'Vision Ready';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 sm:p-6"
      style={{
        background: "linear-gradient(180deg, oklch(0.05 0.02 280), oklch(0.03 0.015 260))",
      }}
    >
      {/* Background glow */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(circle at 50% 40%, oklch(0.6 0.2 280 / 0.15) 0%, transparent 55%)",
        }}
        animate={{
          opacity: presenceState === 'speaking' ? [0.8, 1, 0.8] : 1,
        }}
        transition={{ duration: 1.5, repeat: Infinity }}
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
        <span className="text-xl sm:text-2xl font-bold">MALV AI</span>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-sm text-muted-foreground font-mono">{formatDuration(duration)}</span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: "oklch(0.18 0.03 260)", color: "oklch(0.7 0.15 200)" }}
          >
            HD 1080p
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: "oklch(0.18 0.03 260)", color: "oklch(0.65 0.18 280)" }}
          >
            60 FPS
          </span>
        </div>
      </div>

      {/* Variant Selector */}
      <div className="absolute top-28 sm:top-32 flex items-center gap-2">
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
        state={isVideoOff ? 'muted' : presenceState}
        audioLevel={audioLevel}
        className="w-52 h-52 sm:w-72 sm:h-72"
      />

      {/* Status label */}
      <motion.div
        className="mt-6 sm:mt-8"
        key={presenceState}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div
          className="px-4 py-1.5 rounded-full text-xs font-medium"
          style={{
            background: 'oklch(0.15 0.025 260 / 0.9)',
            border: '1px solid oklch(0.35 0.08 280 / 0.5)',
            color: 'oklch(0.75 0.15 280)',
          }}
        >
          {getStatusLabel()}
        </div>
      </motion.div>

      {/* Connection status */}
      <div className="flex items-center gap-3 mt-4">
        <div className="flex items-center gap-1.5 text-xs text-emerald-400">
          <Signal className="w-3 h-3" />
          <span>Signal Stable</span>
        </div>
        <div className="w-px h-3 bg-border/50" />
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'oklch(0.7 0.15 200)' }}>
          <Shield className="w-3 h-3" />
          <span>Encrypted</span>
        </div>
      </div>

      {/* Self preview */}
      <motion.div
        className="absolute bottom-28 sm:bottom-32 right-4 sm:right-6 w-20 h-28 sm:w-28 sm:h-36 rounded-xl overflow-hidden"
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
      <div className="absolute bottom-10 sm:bottom-12 flex items-center gap-3 sm:gap-4">
        <motion.button
          whileHover={{ scale: 1.1, boxShadow: '0 0 20px oklch(0.7 0.18 200 / 0.3)' }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsMuted(!isMuted)}
          className="w-11 h-11 sm:w-13 sm:h-13 rounded-full flex items-center justify-center"
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
          className="w-11 h-11 sm:w-13 sm:h-13 rounded-full flex items-center justify-center"
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

export default function MALVChat() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("Chats");
  const [messages, setMessages] = useState(mockMessages);
  const [input, setInput] = useState("");
  const [isVoiceCallActive, setIsVoiceCallActive] = useState(false);
  const [isVideoCallActive, setIsVideoCallActive] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingText, setThinkingText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, thinkingText]);

  // Simulate ChatGPT-style streaming thinking
  const simulateThinking = async (userQuery: string) => {
    setIsThinking(true);
    setThinkingText("");

    const thinkingPhrases = [
      `Analyzing the request: "${userQuery.slice(0, 30)}..."`,
      "\n\nSearching through relevant knowledge bases and documentation...",
      "\n\nCross-referencing with stored context and previous interactions...",
      "\n\nEvaluating optimal response strategies...",
      "\n\nFormulating comprehensive answer...",
    ];

    for (const phrase of thinkingPhrases) {
      for (let i = 0; i < phrase.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, 15 + Math.random() * 10));
        setThinkingText((prev) => prev + phrase[i]);
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    await new Promise((resolve) => setTimeout(resolve, 400));
    setIsThinking(false);
    setThinkingText("");

    // Add the assistant response
    const newMessage = {
      id: Date.now(),
      role: "assistant" as const,
      content:
        "I've processed your request and analyzed the relevant information. Based on my analysis, here's what I found:\n\n**Key Insights:**\n- Your query has been thoroughly evaluated\n- Multiple data sources were cross-referenced\n- The response has been optimized for accuracy\n\nIs there anything specific you'd like me to elaborate on?",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      quickActions: ["More Details", "Save Response", "Share"],
    };

    setMessages((prev) => [...prev, newMessage]);
  };

  const handleSend = async () => {
    if (!input.trim() || isThinking) return;

    const userMessage = {
      id: Date.now(),
      role: "user" as const,
      content: input.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    const query = input.trim();
    setInput("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    await simulateThinking(query);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-dvh overflow-hidden" style={{ background: "oklch(0.08 0.015 260)" }}>
      {/* Sidebar */}
      <Sidebar
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{
            background: "oklch(0.08 0.015 260)",
            borderBottom: "1px solid oklch(0.18 0.025 260)",
          }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 hover:bg-secondary rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center lg:hidden"
                style={{
                  background: "linear-gradient(135deg, oklch(0.7 0.18 200), oklch(0.6 0.2 280))",
                }}
              >
                <Sparkles className="w-4 h-4 text-background" />
              </div>
              <div>
                <h1 className="text-base font-semibold">MALV Assistant</h1>
                <div className="flex items-center gap-2">
                  <motion.div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: "oklch(0.7 0.2 145)" }}
                    animate={{ opacity: [1, 0.5, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                  <span className="text-[11px]" style={{ color: "oklch(0.55 0.02 260)" }}>
                    Online
                  </span>
                  <span className="hidden sm:inline text-[11px]" style={{ color: "oklch(0.45 0.02 260)" }}>
                    | Project Alpha
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Header Actions */}
          <div className="flex items-center gap-1.5">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsVoiceCallActive(true)}
              className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-secondary"
            >
              <Phone className="w-4.5 h-4.5" style={{ color: "oklch(0.7 0.18 200)" }} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsVideoCallActive(true)}
              className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-secondary"
            >
              <Video className="w-4.5 h-4.5" style={{ color: "oklch(0.6 0.2 280)" }} />
            </motion.button>
          </div>
        </header>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-2 sm:px-4 py-6 space-y-5">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
                  style={{
                    background: "linear-gradient(135deg, oklch(0.7 0.18 200 / 0.15), oklch(0.6 0.2 280 / 0.15))",
                    border: "1px solid oklch(0.3 0.04 260 / 0.4)",
                  }}
                >
                  <Sparkles className="w-8 h-8" style={{ color: "oklch(0.7 0.18 200)" }} />
                </div>
                <h2 className="text-xl font-semibold mb-2">How can I help you today?</h2>
                <p className="text-sm text-muted-foreground mb-8 text-center max-w-sm">
                  I can help with analysis, coding, writing, and more.
                </p>
                <div className="grid grid-cols-2 gap-3 w-full max-w-md">
                  {starterPrompts.map((prompt) => (
                    <motion.button
                      key={prompt.title}
                      className="p-4 rounded-xl text-left transition-colors"
                      style={{
                        background: "oklch(0.12 0.02 260)",
                        border: "1px solid oklch(0.2 0.025 260)",
                      }}
                      whileHover={{ scale: 1.02, borderColor: "oklch(0.3 0.03 260)" }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <prompt.icon className="w-5 h-5 mb-2" style={{ color: "oklch(0.7 0.18 200)" }} />
                      <p className="text-sm font-medium">{prompt.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{prompt.desc}</p>
                    </motion.button>
                  ))}
                </div>
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

                {/* Thinking Transcript */}
                <AnimatePresence>
                  {isThinking && <ThinkingTranscript isComplete={false} streamText={thinkingText} />}
                </AnimatePresence>
              </>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div
          className="shrink-0 px-3 sm:px-4 py-4"
          style={{
            background: "oklch(0.08 0.015 260)",
            borderTop: "1px solid oklch(0.18 0.025 260)",
          }}
        >
          <div className="max-w-3xl mx-auto">
            <div
              className="relative rounded-2xl overflow-hidden transition-shadow focus-within:ring-2"
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
                className="w-full resize-none bg-transparent px-4 py-3 pr-28 text-sm placeholder:text-muted-foreground focus:outline-none"
                style={{ maxHeight: "140px" }}
              />
              <div className="absolute right-2 bottom-2 flex items-center gap-1">
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
                  disabled={!input.trim() || isThinking}
                  className="p-2 rounded-lg disabled:opacity-40"
                  style={{
                    background: input.trim() && !isThinking ? "oklch(0.7 0.18 200)" : "oklch(0.2 0.03 260)",
                    color: input.trim() && !isThinking ? "oklch(0.08 0.015 260)" : "oklch(0.5 0.02 260)",
                  }}
                  whileHover={input.trim() && !isThinking ? { scale: 1.05 } : {}}
                  whileTap={input.trim() && !isThinking ? { scale: 0.95 } : {}}
                >
                  <Send className="w-4 h-4" />
                </motion.button>
              </div>
            </div>
            <p className="text-center text-[11px] mt-2" style={{ color: "oklch(0.4 0.02 260)" }}>
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
