import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/auth/AuthContext";
import { apiFetch } from "../../lib/api/http";
import { ModuleShell } from "./common/ModuleShell";
import { Card, StatusChip, Skeleton, Button, Input, Switch, SegmentedControl } from "@malv/ui";
import {
  fetchAdminHealth,
  fetchAdminInferenceSettings,
  fetchAdminKillSwitch,
  fetchAdminRuns,
  patchAdminInferenceSettings,
  resetAdminInferenceSettings,
  testAdminInferenceSettings
} from "../../lib/api/dataPlane";

export function AdminControlPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [kill, setKill] = useState<{ systemOn: boolean; occurredAt?: number } | null>(null);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [runs, setRuns] = useState<Array<Record<string, unknown>>>([]);

  const [inference, setInference] = useState<Record<string, unknown> | null>(null);
  const [inferenceDraft, setInferenceDraft] = useState<Record<string, unknown> | null>(null);
  const [inferenceBusy, setInferenceBusy] = useState(false);
  const [inferenceTestBusy, setInferenceTestBusy] = useState(false);
  const [inferenceTestErr, setInferenceTestErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [ks, h, r, inf] = await Promise.all([
          fetchAdminKillSwitch(token),
          fetchAdminHealth(token),
          fetchAdminRuns(token),
          fetchAdminInferenceSettings(token)
        ]);
        if (cancelled) return;
        setKill(ks.state as { systemOn: boolean; occurredAt?: number });
        setHealth(h.worker as Record<string, unknown>);
        setRuns((r.runs as Array<Record<string, unknown>>) ?? []);
        setInference(inf as unknown as Record<string, unknown>);

        const cfg = (inf as any)?.effectiveConfig as Record<string, unknown> | undefined;
        if (cfg) {
          setInferenceDraft({
            enabledOverride: (inf as any)?.configSource === "db_override",
            backendType: cfg.backendType,
            baseUrl: cfg.baseUrl ?? "",
            apiKey: "",
            model: cfg.model ?? "",
            timeoutMs: cfg.timeoutMs ?? 120000,
            fallbackEnabled: cfg.fallbackEnabled ?? false,
            fallbackPolicy: cfg.fallbackPolicy ?? "allow_on_error"
          });
        } else {
          setInferenceDraft(null);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load admin data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function refreshInference() {
    if (!token) return;
    setInferenceBusy(true);
    try {
      const next = await fetchAdminInferenceSettings(token);
      setInference(next as unknown as Record<string, unknown>);
      const cfg = (next as any).effectiveConfig as Record<string, unknown> | undefined;
      if (cfg) {
        setInferenceDraft({
          enabledOverride: next.configSource === "db_override",
          backendType: cfg.backendType,
          baseUrl: cfg.baseUrl ?? "",
          apiKey: "",
          model: cfg.model ?? "",
          timeoutMs: cfg.timeoutMs ?? 120000,
          fallbackEnabled: cfg.fallbackEnabled ?? false,
          fallbackPolicy: cfg.fallbackPolicy ?? "allow_on_error"
        });
      }
      setInferenceTestErr(null);
    } catch (e) {
      setInferenceTestErr(e instanceof Error ? e.message : "Failed to refresh inference settings.");
    } finally {
      setInferenceBusy(false);
    }
  }

  async function refreshBrain() {
    if (!token) return;
    try {
      const h = await apiFetch<{ inferenceStatus?: unknown }>({ path: "/v1/chat/brain-health", accessToken: token });
      setHealth((prev) => ({ ...(prev ?? {}), brainHealth: h }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Brain health failed");
    }
  }

  const backendOptions = [
    { value: "openai_compatible", label: "OpenAI-compatible" },
    { value: "ollama", label: "Ollama" },
    { value: "llamacpp", label: "llama.cpp" },
    { value: "transformers", label: "Transformers" },
    { value: "fallback", label: "Fallback template" },
    { value: "disabled", label: "Disabled/Offline" }
  ] as const;

  const fallbackPolicyOptions = [
    { value: "always_allow", label: "Always allow" },
    { value: "allow_on_error", label: "Allow on health fail" },
    { value: "disabled", label: "Disabled" }
  ] as const;

  return (
    <ModuleShell
      kicker="Control plane"
      title="Admin visibility"
      subtitle="Kill-switch, worker posture, and recent sandbox runs — read-only from the API you already enforce."
      right={kill ? <StatusChip label={kill.systemOn ? "System ON" : "System OFF"} status={kill.systemOn ? "success" : "danger"} /> : null}
    >
      {err ? (
        <Card variant="glass" className="p-4 border border-red-500/30">
          <div className="text-sm text-red-200">{err}</div>
        </Card>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="space-y-4">
          <Card variant="glass" className="p-4 border border-brand/20">
            <div className="font-bold text-sm">Self-upgrade (sandbox → preview → apply)</div>
            <p className="mt-2 text-sm text-malv-text/70">
              Open the private review space where MALV stages work in an isolated worktree and you approve before anything hits the real tree.
            </p>
            <Link
              className="mt-3 inline-flex text-sm font-semibold text-brand underline underline-offset-4"
              to="/app/admin/self-upgrade"
            >
              Go to self-upgrade lab →
            </Link>
          </Card>
          <Card variant="glass" className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="font-bold text-sm">Kill switch (supervisor)</div>
              <button className="text-xs text-malv-text/60 underline" type="button" onClick={() => void refreshBrain()}>
                Refresh brain health
              </button>
            </div>
            <pre className="mt-3 text-xs font-mono text-malv-text/75 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(kill, null, 2)}
            </pre>
          </Card>

          <Card variant="glass" className="p-4">
            <div className="font-bold text-sm">Worker / inference</div>
            <pre className="mt-3 text-xs font-mono text-malv-text/75 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(health, null, 2)}
            </pre>
          </Card>

          <Card variant="glass" className="p-4 border border-white/[0.06]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-bold text-sm">Inference backend routing (admin)</div>
                <div className="mt-1 text-xs text-malv-text/55">
                  Config source: <span className="font-mono text-malv-text/75">{String(inference?.configSource ?? "—")}</span>
                </div>
                <div className="mt-1 text-xs text-malv-text/55">
                  Model: <span className="font-mono text-malv-text/75">{String((inference as any)?.model ?? "—")}</span>
                </div>
              </div>
              {inference ? (
                (() => {
                  const inferenceReady = Boolean((inference as any).inferenceReady);
                  const fallbackActive = Boolean((inference as any).fallbackActive);
                  const backend = String((inference as any).effectiveBackend ?? (inference as any).primaryBackend ?? "—");
                  if (inferenceReady) return <StatusChip label={`Live · ${backend}`} status="success" />;
                  if (fallbackActive) return <StatusChip label={`Fallback · ${backend}`} status="warning" />;
                  return <StatusChip label="Inference Offline" status="danger" />;
                })()
              ) : null}
            </div>

            {inferenceTestErr ? (
              <Card variant="glass" className="p-3 mt-4 border border-red-500/30">
                <div className="text-sm text-red-200">{inferenceTestErr}</div>
              </Card>
            ) : null}

            {inferenceDraft ? (
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-brand">Backend type</div>
                  <SegmentedControl
                    value={String(inferenceDraft.backendType ?? "openai_compatible")}
                    onChange={(v) =>
                      setInferenceDraft((d) => (d ? { ...d, backendType: v } : d))
                    }
                    options={[...backendOptions].map((o) => ({ value: o.value, label: o.label }))}
                    className="w-full"
                  />
                </div>

                {(String(inferenceDraft.backendType) === "openai_compatible" ||
                  String(inferenceDraft.backendType) === "ollama" ||
                  String(inferenceDraft.backendType) === "llamacpp" ||
                  String(inferenceDraft.backendType) === "transformers") && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-brand">Model name / id</div>
                    <Input
                      value={String(inferenceDraft.model ?? "")}
                      onChange={(v) => setInferenceDraft((d) => (d ? { ...d, model: v } : d))}
                      placeholder="e.g. mistralai/Mistral-7B-Instruct-v0.3"
                    />
                  </div>
                )}

                {(String(inferenceDraft.backendType) === "openai_compatible" ||
                  String(inferenceDraft.backendType) === "ollama" ||
                  String(inferenceDraft.backendType) === "llamacpp") && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-brand">Base URL</div>
                    <Input
                      value={String(inferenceDraft.baseUrl ?? "")}
                      onChange={(v) => setInferenceDraft((d) => (d ? { ...d, baseUrl: v } : d))}
                      placeholder="http://host:port/v1"
                    />
                  </div>
                )}

                {String(inferenceDraft.backendType) === "openai_compatible" ? (
                  <div className="space-y-2">
                    <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-brand">API key (optional)</div>
                    <Input
                      type="password"
                      value={String(inferenceDraft.apiKey ?? "")}
                      onChange={(v) => setInferenceDraft((d) => (d ? { ...d, apiKey: v } : d))}
                      placeholder={String((inference?.effectiveConfig as any)?.apiKeyRedacted ?? "Not set")}
                    />
                  </div>
                ) : null}

                <div className="space-y-2">
                  <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-brand">Timeout (ms)</div>
                  <Input
                    value={String(inferenceDraft.timeoutMs ?? 120000)}
                    onChange={(v) => {
                      const next = Number(v);
                      setInferenceDraft((d) => (d ? { ...d, timeoutMs: Number.isFinite(next) ? next : d.timeoutMs } : d));
                    }}
                    placeholder="120000"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-brand">Fallback</div>
                      <div className="text-xs text-malv-text/55">Template fallback behavior when primary can’t be used.</div>
                    </div>
                    <Switch
                      checked={Boolean(inferenceDraft.fallbackEnabled)}
                      onChange={(v) => setInferenceDraft((d) => (d ? { ...d, fallbackEnabled: v } : d))}
                      label={Boolean(inferenceDraft.fallbackEnabled) ? "Enabled" : "Disabled"}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-brand">Fallback policy</div>
                    <SegmentedControl
                      value={String(inferenceDraft.fallbackPolicy ?? "allow_on_error")}
                      onChange={(v) => setInferenceDraft((d) => (d ? { ...d, fallbackPolicy: v } : d))}
                      options={fallbackPolicyOptions.map((o) => ({ value: o.value, label: o.label }))}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    loading={inferenceBusy}
                    disabled={inferenceBusy}
                    onClick={() => {
                      if (!token || !inferenceDraft) return;
                      void (async () => {
                        setInferenceBusy(true);
                        setInferenceTestErr(null);
                        try {
                          const backendType = String(inferenceDraft.backendType ?? "openai_compatible");
                          const dto: any = {
                            enabled: true,
                            backendType,
                            timeoutMs: Number(inferenceDraft.timeoutMs ?? 120000),
                            fallbackEnabled: Boolean(inferenceDraft.fallbackEnabled),
                            fallbackPolicy: String(inferenceDraft.fallbackPolicy ?? "allow_on_error")
                          };
                          if (backendType === "openai_compatible" || backendType === "ollama" || backendType === "llamacpp") {
                            dto.baseUrl = String(inferenceDraft.baseUrl ?? "");
                            dto.model = String(inferenceDraft.model ?? "");
                          } else if (backendType === "transformers") {
                            dto.model = String(inferenceDraft.model ?? "");
                          } else if (backendType === "fallback") {
                            // no model/baseUrl required
                          } else if (backendType === "disabled") {
                            // no model/baseUrl required
                          }

                          if (backendType === "openai_compatible") {
                            const apiKey = String(inferenceDraft.apiKey ?? "").trim();
                            if (apiKey) dto.apiKey = apiKey;
                          }

                          await patchAdminInferenceSettings(token, dto);
                          await refreshInference();
                        } catch (e) {
                          setInferenceTestErr(e instanceof Error ? e.message : "Failed to apply inference settings.");
                        } finally {
                          setInferenceBusy(false);
                        }
                      })();
                    }}
                    className="flex-1"
                  >
                    Apply settings
                  </Button>
                  <Button
                    variant="secondary"
                    loading={inferenceTestBusy}
                    disabled={inferenceTestBusy}
                    onClick={() => {
                      if (!token) return;
                      void (async () => {
                        setInferenceTestBusy(true);
                        setInferenceTestErr(null);
                        try {
                          const res = await testAdminInferenceSettings(token);
                          // Show the returned worker health by refreshing the main GET.
                          // (Test endpoint is mostly for “do I get inferenceReady right now?”)
                          setInference((prev) => (prev ? { ...prev, testResult: (res as any).workerHealth } : prev));
                        } catch (e) {
                          setInferenceTestErr(e instanceof Error ? e.message : "Test failed.");
                        } finally {
                          setInferenceTestBusy(false);
                        }
                      })();
                    }}
                    className="flex-1"
                  >
                    Test connection
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (!token) return;
                      void (async () => {
                        setInferenceTestErr(null);
                        setInferenceBusy(true);
                        try {
                          await resetAdminInferenceSettings(token);
                          await refreshInference();
                        } catch (e) {
                          setInferenceTestErr(e instanceof Error ? e.message : "Reset failed.");
                        } finally {
                          setInferenceBusy(false);
                        }
                      })();
                    }}
                    disabled={inferenceBusy}
                    className="flex-1"
                  >
                    Reset to env
                  </Button>
                </div>

                {inference && (inference as any).testResult ? (
                  <pre className="mt-2 text-xs font-mono text-malv-text/75 overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify((inference as any).testResult, null, 2)}
                  </pre>
                ) : null}
              </div>
            ) : null}
          </Card>

          <Card variant="glass" className="p-4">
            <div className="font-bold text-sm">Recent sandbox runs</div>
            <div className="mt-3 space-y-2">
              {runs.length === 0 ? (
                <div className="text-sm text-malv-text/55">No runs returned.</div>
              ) : (
                runs.map((r) => (
                  <div
                    key={String(r.id)}
                    className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-mono text-malv-text/80"
                  >
                    {String(r.id)} · {String(r.status)} · {String(r.runType)}
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}
    </ModuleShell>
  );
}
