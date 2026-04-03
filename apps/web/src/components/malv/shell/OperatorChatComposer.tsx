import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Plus, Send } from "lucide-react";
import type { MalvPlusActionDefinition, MalvPlusActionId } from "@/lib/malv-plus";
import type { VoiceAssistantChrome } from "@/lib/voice/voiceAssistantTypes";
import { VoiceActionButton } from "@/components/chat/voice";
import { ComposerAttachmentPreview } from "@/components/chat/ComposerAttachmentPreview";
import { attachmentKindFromFile, cloneChatAttachmentRefs } from "@/lib/chat/chatAttachmentUtils";
import type { ChatAttachmentRef } from "@/lib/chat/types";
import { MalvPlusMenu } from "./MalvPlusMenu";

export type OperatorChatComposerHandle = {
  /** Same pipeline as choosing files via the hidden inputs (chips + send). */
  addPendingFilesFromFiles: (files: File[]) => void;
  focusComposerInput: () => void;
};

type PendingComposerAttachment = {
  id: string;
  file: File;
  previewUrl: string;
  status: "uploading" | "ready" | "error";
  progress: number;
  errorMessage?: string;
};

type OperatorChatComposerProps = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (opts?: { attachments?: ChatAttachmentRef[] }) => void | Promise<void>;
  sending?: boolean;
  generationActive?: boolean;
  onStop?: () => void;
  placeholder?: string;
  inlineEditingActive?: boolean;
  /** Fired after a MALV+ action runs (analytics / host hooks). */
  onMalvPlusAction?: (id: MalvPlusActionId) => void;
  /** Composer-integrated voice assistant (browser STT + socket routing). */
  voice?: VoiceAssistantChrome;
};

/**
 * Premium operator composer — file picker, chips, optional composer-integrated voice (`voice` prop).
 */
export const OperatorChatComposer = forwardRef<OperatorChatComposerHandle, OperatorChatComposerProps>(
  function OperatorChatComposer(props, ref) {
  const {
    value,
    onChange,
    onSubmit,
    sending,
    generationActive,
    onStop,
    placeholder = "Message MALV…",
    inlineEditingActive = false,
    onMalvPlusAction,
    voice
  } = props;
  const navigate = useNavigate();
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const plusAnchorRef = useRef<HTMLButtonElement>(null);
  const [malvPlusOpen, setMalvPlusOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingComposerAttachment[]>([]);
  const uploadTimersRef = useRef<number[]>([]);
  const pendingFilesRef = useRef(pendingFiles);
  pendingFilesRef.current = pendingFiles;
  const latestValueRef = useRef(value);
  const MAX_COMPOSER_ATTACHMENTS = 12;
  const MIN_TEXTAREA_HEIGHT_PX = 40;
  const MAX_TEXTAREA_HEIGHT_PX = 160;
  const DEFAULT_TEXTAREA_HEIGHT_FALLBACK_PX = MIN_TEXTAREA_HEIGHT_PX;
  const defaultTextareaHeightPxRef = useRef<number>(DEFAULT_TEXTAREA_HEIGHT_FALLBACK_PX);

  const syncComposerHeight = useCallback((nextValue: string, el?: HTMLTextAreaElement | null) => {
    const textarea = el ?? ta.current;
    if (!textarea) return;

    if (nextValue.trim().length === 0) {
      textarea.style.height = `${MIN_TEXTAREA_HEIGHT_PX}px`;
      return;
    }

    textarea.style.height = "0px";
    const nextHeight = Math.max(MIN_TEXTAREA_HEIGHT_PX, Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT_PX));
    textarea.style.height = `${nextHeight}px`;
  }, []);

  useLayoutEffect(() => {
    const textarea = ta.current;
    if (!textarea) return;

    const previousHeight = textarea.style.height;
    textarea.style.height = "0px";
    const measured = Math.max(MIN_TEXTAREA_HEIGHT_PX, Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT_PX));
    defaultTextareaHeightPxRef.current =
      Number.isFinite(measured) && measured > 0 ? measured : DEFAULT_TEXTAREA_HEIGHT_FALLBACK_PX;
    textarea.style.height = previousHeight;
    syncComposerHeight(value, textarea);
  }, [syncComposerHeight, value]);

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  useEffect(() => {
    syncComposerHeight(value);
  }, [value, syncComposerHeight]);

  const pendingReady =
    pendingFiles.length > 0 && pendingFiles.every((p) => p.status === "ready");
  const pendingBlocked = pendingFiles.some((p) => p.status === "uploading" || p.status === "error");
  const hasTypedText = value.trim().length > 0;

  const voiceBusy = Boolean(voice?.occupiesComposer);

  const canSend =
    (hasTypedText || pendingReady) &&
    !pendingBlocked &&
    !sending &&
    !generationActive &&
    !voiceBusy &&
    !inlineEditingActive;
  const primaryActionMode = generationActive && onStop ? "stop" : "send";
  const primaryActionDisabled = primaryActionMode === "stop" ? false : !canSend;
  const showVoicePrimary = Boolean(voice) && !hasTypedText && !pendingReady && primaryActionMode !== "stop";
  const voicePressMode = voice?.micInteraction === "press";
  const voiceVisualState = (() => {
    if (!voice) return "idle" as const;
    if (voice.phase === "error") return "error" as const;
    if (voice.phase === "finalizing" || voice.phase === "transcribing" || voice.phase === "committed") {
      return "transcribing" as const;
    }
    if (
      voice.phase === "arming" ||
      voice.phase === "listening" ||
      voice.phase === "speech_detected" ||
      voice.phase === "waiting_for_pause"
    ) {
      return "listening" as const;
    }
    return "idle" as const;
  })();

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) void submitWithAttachments();
    }
  }

  const handleMalvPlusActivate = useCallback(
    (action: MalvPlusActionDefinition) => {
      onMalvPlusAction?.(action.id);
      const d = action.dispatch;
      switch (d.type) {
        case "open-file-picker":
          fileInputRef.current?.click();
          break;
        case "open-image-picker":
          imageInputRef.current?.click();
          break;
        case "insert-text": {
          if (!d.text.trim()) return;
          const next = value.trim() ? `${value}\n\n${d.text}` : d.text;
          onChange(next);
          requestAnimationFrame(() => {
            const el = ta.current;
            if (!el) return;
            el.focus();
            const len = next.length;
            el.setSelectionRange(len, len);
            syncComposerHeight(next, el);
          });
          break;
        }
        case "navigate":
          navigate(d.path);
          break;
        default:
          break;
      }
    },
    [navigate, onChange, onMalvPlusAction, value, syncComposerHeight]
  );

  useEffect(() => {
    if (inlineEditingActive) setMalvPlusOpen(false);
  }, [inlineEditingActive]);

  useEffect(() => {
    return () => {
      for (const t of uploadTimersRef.current) window.clearTimeout(t);
      uploadTimersRef.current = [];
      for (const p of pendingFilesRef.current) {
        try {
          URL.revokeObjectURL(p.previewUrl);
        } catch {
          /* noop */
        }
      }
    };
  }, []);

  const pushUploadTimer = useCallback((id: number) => {
    uploadTimersRef.current.push(id);
  }, []);

  const startUploadSimulation = useCallback(
    (id: string, file: File) => {
      if (import.meta.env.DEV && file.name.endsWith(".malvfail")) {
        setPendingFiles((prev) =>
          prev.map((p) =>
            p.id === id
              ? { ...p, status: "error", progress: 0, errorMessage: "Simulated upload failure" }
              : p
          )
        );
        return;
      }
      if (file.size === 0) {
        setPendingFiles((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, status: "error", progress: 0, errorMessage: "File is empty" } : p
          )
        );
        return;
      }

      const steps = 10;
      let step = 0;
      const tick = () => {
        step += 1;
        if (step > steps) {
          setPendingFiles((prev) =>
            prev.map((p) => (p.id === id ? { ...p, status: "ready" as const, progress: 1 } : p))
          );
          return;
        }
        setPendingFiles((prev) =>
          prev.map((p) => (p.id === id ? { ...p, status: "uploading" as const, progress: step / steps } : p))
        );
        pushUploadTimer(window.setTimeout(tick, 48 + Math.random() * 36));
      };
      pushUploadTimer(window.setTimeout(tick, 50));
    },
    [pushUploadTimer]
  );

  const removeFile = useCallback((id: string) => {
    setPendingFiles((prev) => {
      const found = prev.find((f) => f.id === id);
      if (found) {
        try {
          URL.revokeObjectURL(found.previewUrl);
        } catch {
          /* noop */
        }
      }
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const retryFile = useCallback(
    (id: string, file: File) => {
      setPendingFiles((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, status: "uploading", progress: 0, errorMessage: undefined } : p
        )
      );
      queueMicrotask(() => startUploadSimulation(id, file));
    },
    [startUploadSimulation]
  );

  const appendPendingFilesFromFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      setPendingFiles((prev) => {
        const remaining = Math.max(0, MAX_COMPOSER_ATTACHMENTS - prev.length);
        const toAdd = files.slice(0, remaining);
        if (toAdd.length === 0) return prev;
        const added = toAdd.map((file) => ({
          id: crypto.randomUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
          status: "uploading" as const,
          progress: 0
        }));
        for (const p of added) {
          queueMicrotask(() => startUploadSimulation(p.id, p.file));
        }
        return [...prev, ...added];
      });
    },
    [startUploadSimulation]
  );

  useImperativeHandle(
    ref,
    () => ({
      addPendingFilesFromFiles: appendPendingFilesFromFiles,
      focusComposerInput: () => {
        ta.current?.focus();
      }
    }),
    [appendPendingFilesFromFiles]
  );

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    appendPendingFilesFromFiles(files);
    // Allow picking the same file again.
    e.target.value = "";
  }

  async function submitWithAttachments() {
    if (!canSend) return;
    const readyAttachments: ChatAttachmentRef[] = pendingFiles
      .filter((p) => p.status === "ready")
      .map((p) => ({
        id: p.id,
        kind: attachmentKindFromFile(p.file),
        label: p.file.name,
        url: p.previewUrl,
        metadata: {
          mimeType: p.file.type || undefined,
          sizeBytes: p.file.size
        }
      }));
    const attachmentsForSend = cloneChatAttachmentRefs(readyAttachments);
    setPendingFiles([]);
    onChange("");
    requestAnimationFrame(() => syncComposerHeight(latestValueRef.current));
    try {
      await onSubmit({ attachments: attachmentsForSend });
    } catch {
      /* Parent owns thread state; composer stays cleared for the next turn. */
    }
  }

  return (
    <div className="shrink-0 pb-[max(0.125rem,env(safe-area-inset-bottom))] sm:pb-0">
      <div
        className="malv-chat-composer-shell malv-input-dock relative overflow-hidden rounded-[1.25rem] transition-[transform,box-shadow,border-color,background-color,opacity] duration-200 sm:rounded-[1.6rem]"
        style={{
          background: "var(--malv-chat-composer-bg)",
          border: `1px solid ${focused ? "var(--malv-chat-composer-border-strong)" : "var(--malv-chat-composer-border)"}`,
          backdropFilter: "blur(14px)",
          boxShadow: focused
            ? "var(--malv-chat-composer-shadow-focus), inset 0 1px 0 var(--malv-chat-surface-highlight)"
            : "var(--malv-chat-composer-shadow), inset 0 1px 0 var(--malv-chat-surface-highlight)",
          opacity: inlineEditingActive ? 0.72 : 1
        }}
      >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={onFileChange}
            className="hidden"
            aria-hidden
          />
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onFileChange}
            className="hidden"
            aria-hidden
          />

        <div className="px-2.5 py-1.5 sm:px-4 sm:py-2">
          <AnimatePresence initial={false}>
            {pendingFiles.length ? (
              <motion.div
                key="attachment-tray"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="mb-2 overflow-hidden"
              >
                <div
                  className="-mx-0.5 flex min-h-14 flex-nowrap gap-2 overflow-x-auto overflow-y-hidden px-0.5 pb-1 pt-0.5 [scrollbar-width:thin]"
                  style={{
                    maskImage: "linear-gradient(90deg, transparent, black 8px, black calc(100% - 8px), transparent)"
                  }}
                >
                  <AnimatePresence initial={false} mode="popLayout">
                    {pendingFiles.map((p) => (
                      <ComposerAttachmentPreview
                        key={p.id}
                        fileName={p.file.name}
                        isImage={p.file.type.startsWith("image/")}
                        previewUrl={p.previewUrl}
                        status={p.status}
                        progress={p.progress}
                        errorMessage={p.errorMessage}
                        onRemove={() => removeFile(p.id)}
                        onRetry={p.status === "error" ? () => retryFile(p.id, p.file) : undefined}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <motion.button
              ref={plusAnchorRef}
              type="button"
              onClick={() => setMalvPlusOpen((open) => !open)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              aria-label="MALV+ actions"
              aria-expanded={malvPlusOpen}
              aria-haspopup="menu"
              aria-controls={malvPlusOpen ? "malv-plus-menu" : undefined}
              className="malv-interactive inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-malv-text/60 transition-colors hover:text-malv-text/90 focus:outline-none active:bg-white/[0.04] disabled:opacity-40 sm:h-8 sm:w-8"
              disabled={inlineEditingActive}
            >
              <Plus className="h-[18px] w-[18px] sm:h-4 sm:w-4" />
            </motion.button>

            <div className="min-w-0 flex-1">
              <textarea
                ref={ta}
                value={value}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  onChange(nextValue);
                  syncComposerHeight(nextValue, e.target);
                }}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                rows={1}
                className={[
                  "min-h-[40px] w-full max-h-[160px] resize-none overflow-y-auto bg-transparent px-3 py-2 text-[13px] leading-[1.65] text-malv-text placeholder:text-malv-text/30 box-border sm:px-3.5 sm:py-2 sm:text-sm",
                  "border-0 outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 focus-visible:ring-0 shadow-none appearance-none"
                ].join(" ")}
                disabled={voiceBusy || inlineEditingActive}
              />
            </div>

            <div className="flex items-center gap-1 sm:gap-1.5">
              <motion.button
                type="button"
                onClick={() => {
                  if (primaryActionMode === "stop") {
                    onStop?.();
                    return;
                  }
                  void submitWithAttachments();
                }}
                disabled={primaryActionDisabled}
                aria-label={primaryActionMode === "stop" ? "Stop generation" : "Send message"}
                whileHover={!primaryActionDisabled ? { scale: 1.03 } : undefined}
                whileTap={!primaryActionDisabled ? { scale: 0.97 } : undefined}
                className="malv-interactive inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-malv-text/55 transition-colors active:bg-white/[0.04] disabled:opacity-35 sm:h-8 sm:w-8"
                style={{
                  display: showVoicePrimary ? "none" : "inline-flex",
                  color:
                    primaryActionMode === "stop"
                      ? "var(--malv-chat-action-icon-strong)"
                      : hasTypedText || pendingReady
                        ? "var(--malv-chat-action-icon-strong)"
                        : "var(--malv-chat-action-icon-muted)",
                  filter: primaryActionMode === "stop"
                    ? "none"
                    : canSend
                      ? "drop-shadow(0 2px 8px var(--malv-chat-action-icon-shadow))"
                      : "none"
                }}
              >
                {primaryActionMode === "stop" ? (
                  <span className="h-[12px] w-[12px] rounded-[3px] bg-current sm:h-[11px] sm:w-[11px]" aria-hidden />
                ) : (
                  <Send className="h-[18px] w-[18px] sm:h-4 sm:w-4" />
                )}
              </motion.button>

              {voice && showVoicePrimary ? (
                <VoiceActionButton
                  state={voiceVisualState}
                  disabled={inlineEditingActive || voice.micDisabled}
                  pressMode={voicePressMode}
                  onClick={voice.onMicClickToggle}
                  onPointerDown={voice.onMicPointerDown}
                  onPointerUp={voice.onMicPointerUp}
                  onPointerLeave={voice.onMicPointerLeave}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-1.5 flex flex-col items-center justify-center gap-1 sm:mt-1.5 sm:gap-1.5">
        {inlineEditingActive ? (
          <span className="rounded-full border border-amber-200/20 bg-amber-300/8 px-2 py-0.5 text-[10px] text-amber-100/70 sm:px-2.5 sm:py-1 sm:text-[11px]">
            Editing previous message inline
          </span>
        ) : null}
        <p className="text-center text-[10px] leading-snug text-malv-text/45 sm:text-[11px]">
          MALV may produce inaccurate information. Verify critical facts.
        </p>
      </div>

      <MalvPlusMenu
        open={malvPlusOpen}
        onOpenChange={setMalvPlusOpen}
        anchorRef={plusAnchorRef}
        visibility={{ inlineEditingActive }}
        onActivate={handleMalvPlusActivate}
      />
    </div>
  );
});
