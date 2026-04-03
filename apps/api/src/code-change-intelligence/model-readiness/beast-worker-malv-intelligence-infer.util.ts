/**
 * Shared JSON extraction + worker infer helpers for model-assisted CCI augmentation.
 * Failures return null so heuristics remain authoritative.
 */

import type { BeastWorkerClient } from "../../beast/client/beast-worker.client";

export function stripJsonFence(raw: string): string {
  const text = raw.trim();
  if (!text) return text;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? text).trim();
}

export function parseJsonObject(raw: string): Record<string, unknown> | null {
  const candidate = stripJsonFence(raw);
  if (!candidate) return null;
  try {
    const o = JSON.parse(candidate) as unknown;
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    return o as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function inferWorkerText(args: {
  beastWorker: BeastWorkerClient;
  correlationId: string;
  systemPrompt: string;
  userText: string;
  inferTimeoutMs: number;
  promptKey: string;
  signal?: AbortSignal;
}): Promise<string | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), args.inferTimeoutMs);
  const forward = () => ac.abort();
  if (args.signal) {
    if (args.signal.aborted) {
      clearTimeout(timer);
      return null;
    }
    args.signal.addEventListener("abort", forward, { once: true });
  }
  try {
    const res = await args.beastWorker.infer({
      mode: "beast",
      prompt: args.promptKey,
      correlationId: args.correlationId,
      signal: ac.signal,
      context: {
        malvPromptAlreadyExpanded: true,
        malvOperatorMode: "analyze",
        malvInferenceBackend: "openai_compatible",
        messages: [
          { role: "system", content: args.systemPrompt },
          { role: "user", content: args.userText }
        ]
      }
    });
    const reply = (res.reply ?? "").trim();
    return reply.length ? reply : null;
  } catch {
    return null;
  } finally {
    args.signal?.removeEventListener("abort", forward);
    clearTimeout(timer);
  }
}

export function inferTimeoutFromConfig(get: (k: string) => string | undefined, key: string, fallback: number): number {
  const n = Number(get(key) ?? String(fallback));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(10_000, Math.min(120_000, Math.floor(n)));
}
