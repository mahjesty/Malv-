import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth/AuthContext";
import {
  fetchDeviceBridgeHealth,
  fetchDeviceSessions,
  fetchDevices,
  fetchSmartHomeBridgeHealth,
  seedDeviceDevHarness
} from "../../lib/api/dataPlane";
import { ModuleShell } from "./common/ModuleShell";
import { Card, StatusChip } from "@malv/ui";

export function DeviceCenterPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const [devices, setDevices] = useState<Array<Record<string, unknown>>>([]);
  const [sessions, setSessions] = useState<Array<Record<string, unknown>>>([]);
  const [bridge, setBridge] = useState<Record<string, unknown> | null>(null);
  const [smartHome, setSmartHome] = useState<Record<string, unknown> | null>(null);
  const [harnessBusy, setHarnessBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refreshAll(accessToken: string) {
    const [d, s, b, sh] = await Promise.all([
      fetchDevices(accessToken),
      fetchDeviceSessions(accessToken),
      fetchDeviceBridgeHealth(accessToken),
      fetchSmartHomeBridgeHealth(accessToken)
    ]);
    setDevices(d.devices);
    setSessions(s.sessions);
    if (b.ok) {
      setBridge({
        trustModel: b.trustModel,
        tables: b.tables,
        enrollment: b.enrollment,
        devHarness: b.devHarness
      });
    }
    if (sh.ok && sh.bridge) {
      setSmartHome(sh.bridge as Record<string, unknown>);
    }
  }

  useEffect(() => {
    if (!token) return;
    let c = false;
    (async () => {
      try {
        await refreshAll(token);
      } catch (e) {
        if (!c) setErr(e instanceof Error ? e.message : "Failed to load devices.");
      }
    })();
    return () => {
      c = true;
    };
  }, [token]);

  return (
    <ModuleShell
      kicker="Trust fabric"
      title="Devices & bridges"
      subtitle="Production trust data from the API; smart-home bridge status for real connector wiring."
      right={<StatusChip label="Live" status="neutral" />}
    >
      {err ? (
        <Card variant="glass" className="p-4 border border-red-500/25 mb-3">
          <div className="text-sm text-red-200">{err}</div>
        </Card>
      ) : null}

      {bridge ? (
        <Card variant="glass" className="p-4 mb-3">
          <div className="font-bold text-sm">Device bridge (production)</div>
          <pre className="mt-2 max-h-40 overflow-auto text-[11px] text-malv-text/75 whitespace-pre-wrap">
            {JSON.stringify(bridge, null, 2)}
          </pre>
        </Card>
      ) : null}

      {smartHome ? (
        <Card variant="glass" className="p-4 mb-3">
          <div className="font-bold text-sm">Smart-home bridge</div>
          <pre className="mt-2 max-h-40 overflow-auto text-[11px] text-malv-text/75 whitespace-pre-wrap">
            {JSON.stringify(smartHome, null, 2)}
          </pre>
        </Card>
      ) : null}

      <details className="mb-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <summary className="cursor-pointer text-sm font-semibold text-malv-text/80">Optional dev harness (QA only)</summary>
        <p className="mt-2 text-xs text-malv-text/55">
          Seeds test rows when <code className="text-malv-text/70">MALV_DEV_HARNESS_ENABLED</code> is set on the API. Not enrollment and not the product path.
        </p>
        <button
          type="button"
          className="mt-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs"
          disabled={!token || harnessBusy}
          onClick={() => {
            if (!token) return;
            setHarnessBusy(true);
            void seedDeviceDevHarness(token, { deviceCount: 3, sessionCount: 8 })
              .then((out) => {
                if (!out.ok) throw new Error((out as { error?: string }).error ?? "Harness seed failed.");
                return refreshAll(token);
              })
              .catch((e) => setErr(e instanceof Error ? e.message : "Harness seed failed."))
              .finally(() => setHarnessBusy(false));
          }}
        >
          {harnessBusy ? "Seeding…" : "Seed dev harness data"}
        </button>
      </details>

      <Card variant="glass" className="p-4 mb-3">
        <div className="font-bold text-sm">Trusted devices</div>
        {devices.length === 0 ? (
          <div className="text-sm text-malv-text/60 mt-2">No trusted device rows yet — connect clients via real auth enrollment.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {devices.map((d) => (
              <div key={String(d.id)} className="rounded-xl border border-white/10 p-3 text-sm font-mono text-malv-text/80">
                {String(d.deviceLabel || d.deviceFingerprint)}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card variant="glass" className="p-4">
        <div className="font-bold text-sm">Recent sessions</div>
        {sessions.length === 0 ? (
          <div className="text-sm text-malv-text/60 mt-2">No session history returned.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {sessions.map((s) => (
              <div key={String(s.id)} className="rounded-xl border border-white/10 p-3 text-xs font-mono text-malv-text/75">
                {String(s.id).slice(0, 10)}… · {String(s.status)} · last {String(s.lastSeenAt)}
              </div>
            ))}
          </div>
        )}
      </Card>
    </ModuleShell>
  );
}
