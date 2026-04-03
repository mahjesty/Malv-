import { useEffect, useState } from "react";
import { ModuleShell } from "./common/ModuleShell";
import { Card, StatusChip, SegmentedControl } from "@malv/ui";
import { apiFetch } from "../../lib/api/http";
import { useAuth } from "../../lib/auth/AuthContext";
import { getMalvBeastLevel, setMalvBeastLevel } from "../../lib/malvOperatorPrefs";
import type { BeastLevel } from "../../lib/malvBeastLevel";

const levels: BeastLevel[] = ["Passive", "Smart", "Advanced", "Beast"];

type OperatorSummary = {
  beastChatJobsLast24h: number;
  suggestionRecordsLast24h: number;
  latestSuggestionPreview: string | null;
  latestSuggestionAt: string | null;
};

export function BeastCenterPage() {
  const { accessToken } = useAuth();
  const [level, setLevel] = useState<BeastLevel>("Smart");
  const [armed, setArmed] = useState(true);
  const [intel, setIntel] = useState<OperatorSummary | null>(null);
  const [intelErr, setIntelErr] = useState<string | null>(null);

  useEffect(() => {
    setLevel(getMalvBeastLevel());
  }, []);

  useEffect(() => {
    const token = accessToken ?? undefined;
    if (!token) {
      setIntel(null);
      setIntelErr(null);
      return;
    }
    let cancelled = false;
    setIntelErr(null);
    apiFetch<{ ok: boolean; summary?: OperatorSummary; error?: string }>({
      path: "/v1/beast/operator-summary",
      accessToken: token
    })
      .then((r) => {
        if (cancelled) return;
        if (r.ok && r.summary) setIntel(r.summary);
        else setIntelErr(r.error ?? "Could not load operator summary.");
      })
      .catch((e) => {
        if (!cancelled) setIntelErr(e instanceof Error ? e.message : "Summary unavailable.");
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  function onLevelChange(next: BeastLevel) {
    setLevel(next);
    setMalvBeastLevel(next);
  }

  const behavior =
    level === "Passive"
      ? "Occasional low-friction suggestions. Minimal proactive scheduling."
      : level === "Smart"
        ? "Pattern-based reminders, friction detection hints, and guided next steps."
        : level === "Advanced"
          ? "Deeper synthesis, proactive planning, stronger follow-through assistance."
          : "Highest proactive intelligence: heavy reasoning routes to private GPU + staged sandbox actions.";

  return (
    <ModuleShell
      kicker="Intelligence plane"
      title="Beast control"
      subtitle="Emotionally intelligent, auditable Beast Mode — policy-gated, GPU-routed, never a black box."
      right={<StatusChip label={armed ? "Armed" : "Paused"} status={armed ? "success" : "neutral"} />}
    >
      <div className="space-y-6">
        <Card variant="glass" elevation="raised" className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-malv-text/40">Aggression curve</div>
              <p className="text-sm text-malv-text/70 mt-2 leading-relaxed max-w-prose">{behavior}</p>
            </div>
            <StatusChip label={level} status={level === "Beast" ? "warning" : "neutral"} />
          </div>

          <div className="mt-6">
            <SegmentedControl
              value={level}
              onChange={(v) => onLevelChange(v as BeastLevel)}
              options={levels.map((l) => ({ value: l, label: l }))}
              className="w-full sm:w-auto"
            />
          </div>

          <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-white/[0.07] bg-surface-base/60 p-4">
            <div>
              <div className="font-semibold text-sm">Armed for proactive jobs</div>
              <div className="text-sm text-malv-text/60 mt-1">GPU + sandbox gates still apply before any side effect.</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={armed}
              onClick={() => setArmed((v) => !v)}
              className="relative h-9 w-16 shrink-0 rounded-full border border-white/[0.1] bg-surface-overlay transition"
            >
              <span
                className={[
                  "absolute top-1 left-1 h-7 w-7 rounded-full shadow-panel transition-all duration-200",
                  armed ? "translate-x-7 bg-gradient-to-br from-brand to-accent-violet shadow-glow-sm" : "bg-white/20"
                ].join(" ")}
              />
            </button>
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          {[
            { t: "Friction detection", d: "Repeated stalls and unfinished work surfaces as signals, not nagging." },
            { t: "Next-step prediction", d: "Contextual actions ranked by policy safety and your history." },
            { t: "Support-aware synthesis", d: "Escalation pulls ticket + help center context without leaking vault." }
          ].map((x) => (
            <Card key={x.t} interactive variant="glass" className="p-5">
              <div className="text-sm font-semibold text-malv-text">{x.t}</div>
              <div className="text-sm text-malv-text/60 mt-2 leading-relaxed">{x.d}</div>
            </Card>
          ))}
        </div>

        <Card elevation="deep" className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-malv-text/40">Live operator intel (24h)</div>
            <StatusChip label={intel ? "Synced" : intelErr ? "Offline" : "…"} status={intel ? "success" : intelErr ? "warning" : "neutral"} />
          </div>
          {intelErr ? (
            <p className="text-sm text-malv-text/70 mt-3">{intelErr}</p>
          ) : intel ? (
            <div className="mt-3 space-y-2 text-sm text-malv-text/70">
              <p>
                Beast chat jobs <span className="font-mono text-malv-text/90">{intel.beastChatJobsLast24h}</span> · suggestion rows{" "}
                <span className="font-mono text-malv-text/90">{intel.suggestionRecordsLast24h}</span>
              </p>
              {intel.latestSuggestionPreview ? (
                <p className="leading-relaxed text-malv-text/60">
                  Latest suggestion: {intel.latestSuggestionPreview}
                  {intel.latestSuggestionAt ? (
                    <span className="block text-xs mt-1 opacity-80">
                      {new Date(intel.latestSuggestionAt).toLocaleString()}
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className="text-malv-text/50">No suggestion rows yet — complete a turn in Operator chat.</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-malv-text/60 mt-3 leading-relaxed">Loading…</p>
          )}
        </Card>
      </div>
    </ModuleShell>
  );
}
