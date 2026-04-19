import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import { Button, Card } from "@malv/ui";
import { useAuth } from "../../../lib/auth/AuthContext";
import { createWorkspaceTask, sendChatMessage } from "../../../lib/api/dataPlane";
import { parseNestErrorMessage } from "../../../lib/api/http-core";
import {
  exploreCapabilityPath,
  getExploreCapability,
  isExploreCategoryId,
  type ExploreCapabilityDefinition
} from "../../../lib/explore/exploreCapabilityRegistry";
import { pushExploreContinue } from "../../../lib/explore/exploreContinueStorage";
import {
  buildExploreContinueChatPrompt,
  exploreNavigateToChatWithPrompt,
  exploreNavigateToChatWithThread,
  exploreNavigateToMemory,
  exploreNavigateToStudioBrief,
  exploreNavigateToTasks,
  exploreNavigateToVoice
} from "../../../lib/explore/exploreLaunch";
import { ExploreImageGeneratorWorkspace } from "./ExploreImageGeneratorWorkspace";

function buildOperatorPayload(def: ExploreCapabilityDefinition, userText: string): string {
  const body = userText.trim();
  const header = `[Explore · ${def.title}]\n${def.operatorBrief.trim()}`;
  if (!body) return header;
  return `${header}\n\n---\nUser input:\n${body}`;
}

export function ExploreCapabilityPage() {
  const { categoryId, capabilityId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;

  const def = useMemo(() => {
    if (!categoryId || !capabilityId) return null;
    if (!isExploreCategoryId(categoryId)) return null;
    return getExploreCapability(categoryId, capabilityId);
  }, [categoryId, capabilityId]);

  const [input, setInput] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskCreatedId, setTaskCreatedId] = useState<string | null>(null);

  useEffect(() => {
    const q = (searchParams.get("q") ?? "").trim();
    if (q) setInput(q);
  }, [searchParams]);

  const rememberContinue = useCallback(
    (d: ExploreCapabilityDefinition) => {
      pushExploreContinue({
        href: exploreCapabilityPath(d),
        title: d.title,
        subtitle: "Capability workspace"
      });
    },
    []
  );

  useEffect(() => {
    if (!def) return;
    rememberContinue(def);
  }, [def, rememberContinue]);

  if (!categoryId || !capabilityId || !def) {
    return <Navigate to="/app/explore" replace />;
  }

  if (def.categoryId === "create" && def.capabilityId === "image") {
    return <ExploreImageGeneratorWorkspace def={def} />;
  }

  const runChat = async () => {
    if (!token) {
      setError("Sign in to run this capability.");
      return;
    }
    setBusy(true);
    setError(null);
    setTaskCreatedId(null);
    try {
      const message = buildOperatorPayload(def, input);
      const res = await sendChatMessage(token, {
        message,
        conversationId,
        sessionType: null
      });
      setOutput(res.reply ?? "");
      if (res.conversationId) setConversationId(res.conversationId);
    } catch (e) {
      setError(e instanceof Error ? parseNestErrorMessage(e) : "Request failed.");
    } finally {
      setBusy(false);
    }
  };

  const runQueueTask = async () => {
    if (!token) {
      setError("Sign in to queue a task.");
      return;
    }
    const raw = input.trim();
    if (!raw) {
      setError("Add a short description so the task is actionable.");
      return;
    }
    setBusy(true);
    setError(null);
    setOutput(null);
    setTaskCreatedId(null);
    try {
      const lines = raw.split(/\n/).map((l) => l.trim()).filter(Boolean);
      const title = (lines[0] ?? raw).slice(0, 200);
      const description = lines.length > 1 ? lines.slice(1).join("\n") : raw;
      const res = await createWorkspaceTask(token, {
        title,
        description,
        source: "manual",
        sourceSurface: "manual",
        status: "todo",
        executionType: "manual"
      });
      if (!res.ok || !res.task) throw new Error("Task create failed");
      setTaskCreatedId(res.task.id);
      setOutput(`Queued “${res.task.title}”. Open Tasks to track it — runs and automations can attach there when configured.`);
    } catch (e) {
      setError(e instanceof Error ? parseNestErrorMessage(e) : "Could not create task.");
    } finally {
      setBusy(false);
    }
  };

  const primaryAction = () => {
    rememberContinue(def);
    switch (def.runKind) {
      case "chat_roundtrip":
        void runChat();
        return;
      case "open_studio_brief":
        exploreNavigateToStudioBrief(navigate, input.trim() || def.inputPlaceholder);
        return;
      case "open_voice":
        exploreNavigateToVoice(navigate);
        return;
      case "open_memory":
        exploreNavigateToMemory(navigate);
        return;
      case "queue_task":
        void runQueueTask();
        return;
    }
  };

  const primaryLabel =
    def.runKind === "chat_roundtrip"
      ? "Run with MALV"
      : def.runKind === "open_studio_brief"
        ? "Open in Studio"
        : def.runKind === "open_voice"
          ? "Open voice channel"
          : def.runKind === "open_memory"
            ? "Open Memory"
            : "Queue workspace task";

  const showTextInput = def.runKind !== "open_memory" || Boolean(def.inputPlaceholder);

  return (
    <div className="mx-auto max-w-[880px] px-4 pb-20 sm:px-6 lg:px-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-malv-f-gold/22 to-transparent text-malv-f-gold ring-1 ring-malv-f-gold/25">
            <def.icon className="h-6 w-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-malv-text/45">Explore capability</p>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-malv-text sm:text-4xl">{def.title}</h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-malv-text/65">{def.description}</p>
            {def.bestFor ? (
              <p className="mt-2 text-[13px] text-malv-text/50">
                <span className="font-medium text-malv-text/60">Best for:</span> {def.bestFor}
              </p>
            ) : null}
            {def.badge ? (
              <p className="mt-2 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-mono uppercase tracking-[0.14em] text-malv-text/55">
                {def.badge}
              </p>
            ) : null}
          </div>
        </div>
      </motion.div>

      <Card variant="glass" elevation="raised" className="mt-10 overflow-hidden border-white/10 p-0">
        <div className="border-b border-white/10 bg-white/[0.03] px-5 py-4 sm:px-6">
          <h2 className="text-sm font-semibold text-malv-text">Workspace</h2>
          <p className="mt-1 text-[13px] text-malv-text/55">
            {def.runKind === "chat_roundtrip"
              ? "One-shot reply from the same model path as Chat — staged here so you can read the answer before opening a full thread."
              : def.runKind === "queue_task"
                ? "Creates a real workspace row in Tasks — not a pretend background job."
                : def.runKind === "open_studio_brief"
                  ? "Hands a structured brief to Studio (you leave Explore for the deep build / preview / apply loop)."
                  : def.runKind === "open_voice"
                    ? "Opens the live Voice surface — spoken interaction, distinct from typing in Chat."
                    : def.runKind === "open_memory"
                      ? "Opens Memory — scoped retention, distinct from a chat transcript."
                      : ""}
          </p>
        </div>

        <div className="space-y-5 px-5 py-6 sm:px-6">
          {showTextInput ? (
            <div>
              <label className="text-[13px] font-medium text-malv-text/75" htmlFor="cap-input">
                Your input
              </label>
              <textarea
                id="cap-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={def.inputPlaceholder}
                rows={6}
                className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-[15px] leading-relaxed text-malv-text outline-none placeholder:text-[color:var(--malv-color-text-placeholder)] focus:border-malv-f-live/38 focus:ring-2 focus:ring-malv-f-ring-live/20"
              />
            </div>
          ) : (
            <p className="text-sm text-malv-text/55">
              Memory is the right place for durable, scoped context — separate from Explore workspaces and chat threads.
            </p>
          )}

          {def.runKind === "open_voice" && input.trim() ? (
            <p className="text-[12px] leading-relaxed text-malv-text/45">
              Your note is not sent automatically; keep it visible while you connect, or paste it into Voice or Chat after.
            </p>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100/90">{error}</div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="primary"
              className="min-h-[44px] px-6"
              loading={busy}
              disabled={busy || (def.runKind === "queue_task" && !input.trim())}
              onClick={() => primaryAction()}
            >
              {primaryLabel}
            </Button>
            {def.runKind === "chat_roundtrip" && conversationId ? (
              <Button
                type="button"
                variant="secondary"
                className="min-h-[44px]"
                onClick={() => exploreNavigateToChatWithThread(navigate, conversationId)}
              >
                Continue in Chat (same thread)
              </Button>
            ) : null}
          </div>

          {output ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <h3 className="text-[12px] font-mono uppercase tracking-[0.18em] text-malv-text/45">Result</h3>
              <div className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-malv-text/85">{output}</div>
              {taskCreatedId ? (
                <p className="mt-3 text-[13px] text-malv-text/55">
                  Task id <span className="font-mono text-malv-text/70">{taskCreatedId}</span>
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="border-t border-white/10 pt-5">
            <h3 className="text-[12px] font-mono uppercase tracking-[0.18em] text-malv-text/45">Follow up</h3>
            <p className="mt-1 text-[13px] text-malv-text/50">
              Chat = threaded conversation UI · Studio = build / preview · Tasks = execution queue · Voice = live speech · Memory = scoped retention.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {def.followUp.showChat ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-[40px]"
                  onClick={() =>
                    exploreNavigateToChatWithPrompt(
                      navigate,
                      buildExploreContinueChatPrompt({
                        capabilityTitle: def.title,
                        userBrief: input,
                        assistantReply: output ?? undefined
                      })
                    )
                  }
                >
                  Open Chat (new thread, carries context)
                </Button>
              ) : null}
              {def.followUp.showStudio ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-[40px]"
                  onClick={() => exploreNavigateToStudioBrief(navigate, input.trim() || def.title)}
                >
                  Open in Studio
                </Button>
              ) : null}
              {def.followUp.showTasks ? (
                <Button type="button" variant="secondary" className="min-h-[40px]" onClick={() => exploreNavigateToTasks(navigate)}>
                  Open Tasks
                </Button>
              ) : null}
              {def.followUp.showVoice ? (
                <Button type="button" variant="secondary" className="min-h-[40px]" onClick={() => exploreNavigateToVoice(navigate)}>
                  Open Voice
                </Button>
              ) : null}
              {def.followUp.showMemory ? (
                <Button type="button" variant="secondary" className="min-h-[40px]" onClick={() => exploreNavigateToMemory(navigate)}>
                  Open Memory
                </Button>
              ) : null}
            </div>
          </div>

          <p className="flex items-start gap-2 text-[12px] leading-relaxed text-malv-text/45">
            <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Capabilities stay inside Explore until you explicitly open Chat, Studio, Tasks, Voice, or Memory — no hidden redirects.
          </p>
        </div>
      </Card>
    </div>
  );
}
