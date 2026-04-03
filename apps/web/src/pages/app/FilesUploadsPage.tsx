import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth/AuthContext";
import {
  devHarnessMultimodalDeep,
  enqueueFileUnderstand,
  enqueueMultimodalDeep,
  type FileListItem,
  fetchConversations,
  fetchFileStorageHealth,
  fetchFiles,
  fetchMultimodalDeep,
  type MultimodalExtractionPayload,
  uploadFileToStorage
} from "../../lib/api/dataPlane";
import { ModuleShell } from "./common/ModuleShell";
import { Card, StatusChip } from "@malv/ui";
import { saveVideoChatContext, type VideoTimelineSegment } from "../../lib/video/videoChatContext";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractVideoIntelligence(extraction: MultimodalExtractionPayload | null): {
  durationSec?: number;
  width?: number;
  height?: number;
  segments?: number;
  status: "queued" | "processing" | "completed" | "failed" | "unknown";
  timeline: VideoTimelineSegment[];
  reasoningCoverage: number;
} | null {
  if (!extraction) return null;
  const status = extraction.status;
  const unified = asRecord(extraction.unifiedResult);
  const video = asRecord(unified?.video);
  const segmentMeta = asRecord(extraction.segmentMetaJson);
  const rawTimeline = Array.isArray(segmentMeta?.timeline) ? segmentMeta.timeline : [];
  const rawSegmentIntelligence = Array.isArray(segmentMeta?.segmentIntelligence) ? segmentMeta.segmentIntelligence : [];
  const byTime = new Map<string, Record<string, unknown>>();
  for (const row of rawSegmentIntelligence) {
    const item = asRecord(row);
    if (!item) continue;
    const s = typeof item.tStartSec === "number" ? item.tStartSec : null;
    const e = typeof item.tEndSec === "number" ? item.tEndSec : null;
    if (s == null || e == null) continue;
    byTime.set(`${s}:${e}`, item);
  }
  const timeline: VideoTimelineSegment[] = [];
  for (const seg of rawTimeline) {
    const row = asRecord(seg);
    if (!row) continue;
    const tStartSec = typeof row.tStartSec === "number" ? row.tStartSec : null;
    const tEndSec = typeof row.tEndSec === "number" ? row.tEndSec : null;
    if (tStartSec == null || tEndSec == null) continue;
    const enriched = byTime.get(`${tStartSec}:${tEndSec}`);
    const segment: VideoTimelineSegment = {
      label: typeof row.label === "string" ? row.label : `scene_${Math.round(tStartSec)}`,
      tStartSec,
      tEndSec
    };
    if (typeof enriched?.explanation === "string") segment.explanation = enriched.explanation;
    if (Array.isArray(enriched?.keyObservations))
      segment.keyObservations = enriched.keyObservations.filter((x): x is string => typeof x === "string");
    if (Array.isArray(enriched?.keyActions))
      segment.keyActions = enriched.keyActions.filter((x): x is string => typeof x === "string");
    if (Array.isArray(enriched?.warnings)) segment.warnings = enriched.warnings.filter((x): x is string => typeof x === "string");
    if (enriched?.confidence === "high" || enriched?.confidence === "medium" || enriched?.confidence === "low")
      segment.confidence = enriched.confidence;
    if (typeof enriched?.visualSummary === "string") segment.visualSummary = enriched.visualSummary;
    if (Array.isArray(enriched?.uiElements))
      segment.uiElements = enriched.uiElements.filter((x): x is string => typeof x === "string");
    if (Array.isArray(enriched?.visibleErrors))
      segment.visibleErrors = enriched.visibleErrors.filter((x): x is string => typeof x === "string");
    if (typeof enriched?.thumbnailDataUrl === "string") segment.thumbnailDataUrl = enriched.thumbnailDataUrl;
    timeline.push(segment);
  }
  if (!video && timeline.length === 0) return null;
  return {
    durationSec: typeof video?.durationSec === "number" ? video.durationSec : undefined,
    width: typeof video?.width === "number" ? video.width : undefined,
    height: typeof video?.height === "number" ? video.height : undefined,
    segments: typeof video?.timelineSegments === "number" ? video.timelineSegments : timeline.length,
    status: status === "queued" || status === "processing" || status === "completed" || status === "failed" ? status : "unknown",
    timeline,
    reasoningCoverage: timeline.length ? timeline.filter((x) => Boolean(x.explanation)).length / timeline.length : 0
  };
}

function fmtSec(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

function inferKind(file: File): "pdf" | "image" | "audio" | "video" | "doc" | "text" {
  const t = file.type;
  if (t === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("audio/")) return "audio";
  if (t.startsWith("video/")) return "video";
  if (t.includes("wordprocessing") || /\.docx$/i.test(file.name)) return "doc";
  return "text";
}

export function FilesUploadsPage() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const [files, setFiles] = useState<FileListItem[]>([]);
  const [conversations, setConversations] = useState<Array<{ id: string; title: string | null }>>([]);
  const [linkConv, setLinkConv] = useState<string>("");
  const [selectedFileId, setSelectedFileId] = useState<string>("");
  const [multimodalPreview, setMultimodalPreview] = useState<MultimodalExtractionPayload | null>(null);
  const [storageHealth, setStorageHealth] = useState<{ writable: boolean; root?: string } | null>(null);
  const [mmBusy, setMmBusy] = useState(false);
  const [mmState, setMmState] = useState<"idle" | "queued" | "processing" | "done" | "failed">("idle");
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const videoIntel = useMemo(() => extractVideoIntelligence(multimodalPreview), [multimodalPreview]);
  const selectedFile = files.find((f) => f.id === selectedFileId) ?? null;
  const selectedSegment =
    selectedSegmentIndex != null && videoIntel?.timeline[selectedSegmentIndex]
      ? videoIntel.timeline[selectedSegmentIndex]
      : null;
  const keyMoments = useMemo(() => {
    if (!videoIntel) return [];
    const tl = videoIntel.timeline;
    if (tl.length === 0) return [];
    const mid = tl[Math.floor(tl.length / 2)];
    const longest = [...tl].sort((a, b) => b.tEndSec - b.tStartSec - (a.tEndSec - a.tStartSec))[0];
    const candidates = [tl[0], mid, tl[tl.length - 1], longest].filter((x): x is VideoTimelineSegment => Boolean(x));
    return candidates.filter((x, i, arr) => arr.findIndex((y) => y.tStartSec === x.tStartSec && y.tEndSec === x.tEndSec) === i);
  }, [videoIntel]);
  const detectedIssues = useMemo(() => {
    if (!videoIntel) return [];
    const issues: string[] = [];
    if (videoIntel.durationSec == null) issues.push("Duration metadata unavailable (ffprobe incomplete).");
    if (videoIntel.width == null || videoIntel.height == null) issues.push("Resolution metadata missing.");
    if (!videoIntel.timeline.length) issues.push("Timeline not generated yet.");
    if (videoIntel.timeline.length > 0 && videoIntel.timeline.every((s) => s.tEndSec - s.tStartSec < 3)) {
      issues.push("Timeline segments are unusually short; source video may be fragmented.");
    }
    return issues;
  }, [videoIntel]);
  const intelligenceSummary = useMemo(() => {
    if (!videoIntel) return null;
    const duration = videoIntel.durationSec != null ? `${Math.round(videoIntel.durationSec)}s` : "unknown duration";
    const resolution = `${videoIntel.width ?? "?"}x${videoIntel.height ?? "?"}`;
    const sceneCount = videoIntel.timeline.length;
    const coverage = Math.round((videoIntel.reasoningCoverage ?? 0) * 100);
    return `Video is ${duration} at ${resolution}, segmented into ${sceneCount} scene${sceneCount === 1 ? "" : "s"} with ${coverage}% reasoning coverage.`;
  }, [videoIntel]);

  const refresh = useCallback(async () => {
    if (!token) return;
    const [f, c, sh] = await Promise.all([
      fetchFiles(token),
      fetchConversations(token, { limit: 30 }),
      fetchFileStorageHealth(token).catch(() => null)
    ]);
    setFiles(f.items);
    const convs = c.items.map((x) => ({ id: x.id, title: x.title }));
    setConversations(convs);
    setLinkConv((prev) => prev || convs[0]?.id || "");
    if (sh?.storage) setStorageHealth({ writable: sh.storage.writable, root: sh.storage.root });
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void refresh().catch((e) => setErr(e instanceof Error ? e.message : "Load failed"));
  }, [token, refresh]);

  async function onPick(list: FileList | null) {
    if (!token || !list?.length) return;
    const f = list[0];
    if (!f) return;
    setBusy(true);
    setErr(null);
    try {
      const fileKind = inferKind(f);
      const reg = await uploadFileToStorage(token, { file: f, fileKind });
      if (!linkConv) {
        setErr("Select a conversation to link processing (required by API).");
        setBusy(false);
        return;
      }
      await enqueueFileUnderstand(token, reg.fileId, {
        conversationId: linkConv,
        requiresApproval: false
      });
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload pipeline failed.");
    } finally {
      setBusy(false);
    }
  }

  async function pollMultimodal(fileId: string) {
    if (!token) return;
    for (let i = 0; i < 24; i += 1) {
      const out = await fetchMultimodalDeep(token, fileId).catch(() => null);
      if (!out?.ok || !out.extraction) {
        await new Promise((r) => window.setTimeout(r, 1200));
        continue;
      }
      setMultimodalPreview(out.extraction);
      const status = out.extraction.status;
      if (status === "queued") setMmState("queued");
      else if (status === "processing") setMmState("processing");
      else if (status === "completed") {
        setMmState("done");
        return;
      } else if (status === "failed") {
        setMmState("failed");
        return;
      }
      await new Promise((r) => window.setTimeout(r, 1200));
    }
  }

  function askMalvAboutVideo(segment?: VideoTimelineSegment | null) {
    if (!videoIntel || !selectedFileId) return;
    const key = saveVideoChatContext({
      fileId: selectedFileId,
      fileName: selectedFile ? selectedFile.originalName : selectedFileId,
      durationSec: videoIntel.durationSec,
      width: videoIntel.width,
      height: videoIntel.height,
      timeline: videoIntel.timeline,
      selectedSegment: segment ?? null
    });
    navigate(`/app/chat?videoContextKey=${encodeURIComponent(key)}&askVideo=1`);
  }

  return (
    <ModuleShell
      kicker="Ingest"
      title="File intelligence"
      subtitle="Production path: multipart upload to private storage, then understanding and deep multimodal extraction."
      right={<StatusChip label="Live API" status="ok" />}
    >
      {err ? (
        <Card variant="glass" className="p-4 border border-red-500/25 mb-3">
          <div className="text-sm text-red-200">{err}</div>
        </Card>
      ) : null}

      {storageHealth ? (
        <Card variant="glass" className="p-3 mb-3">
          <div className="text-xs text-malv-text/70">
            Storage: {storageHealth.writable ? "writable" : "not writable"}
            {storageHealth.root ? ` · ${storageHealth.root}` : ""}
          </div>
        </Card>
      ) : null}

      <Card variant="glass" className="p-4 space-y-3 mb-4">
        <div className="text-sm font-semibold">Link processing to conversation</div>
        <select
          value={linkConv}
          onChange={(e) => setLinkConv(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
        >
          <option value="">Select conversation…</option>
          {conversations.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title?.trim() || c.id.slice(0, 8)}
            </option>
          ))}
        </select>
        <div>
          <input
            type="file"
            className="text-sm text-malv-text/80"
            onChange={(e) => void onPick(e.target.files)}
            disabled={busy}
          />
        </div>
        <div className="text-xs text-malv-text/55">
          Files are written under PRIVATE_STORAGE_ROOT on the API host, then registered for extraction (real pipeline — not a placeholder URI).
        </div>
      </Card>

      <Card variant="glass" className="p-4 space-y-3 mb-4">
        <div className="text-sm font-semibold">Deep multimodal (production)</div>
        <div className="text-xs text-malv-text/60">
          Queues real extraction (PDF text, image dimensions, ffprobe for audio/video). Requires successful upload above.
        </div>
        <select
          value={selectedFileId}
          onChange={(e) => setSelectedFileId(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
        >
          <option value="">Select file…</option>
          {files.map((f) => (
            <option key={f.id} value={f.id}>
              {f.originalName} ({f.fileKind})
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs"
            disabled={!token || !selectedFileId || mmBusy}
            onClick={() => {
              if (!token || !selectedFileId) return;
              setMmBusy(true);
              setErr(null);
              setMmState("queued");
              void enqueueMultimodalDeep(token, selectedFileId)
                .then(() => pollMultimodal(selectedFileId))
                .catch((e) => setErr(e instanceof Error ? e.message : "Deep extraction failed."))
                .finally(() => setMmBusy(false));
            }}
          >
            {mmBusy ? "Running…" : "Run deep extraction"}
          </button>
          <button
            type="button"
            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs"
            disabled={!token || !selectedFileId || mmBusy}
            onClick={() => {
              if (!token || !selectedFileId) return;
              setMmBusy(true);
              setErr(null);
              void fetchMultimodalDeep(token, selectedFileId)
                .then((out) => {
                  setMultimodalPreview(out.extraction);
                  const status = out.extraction.status;
                  if (status === "queued") setMmState("queued");
                  else if (status === "processing") setMmState("processing");
                  else if (status === "completed") setMmState("done");
                  else if (status === "failed") setMmState("failed");
                })
                .catch((e) => setErr(e instanceof Error ? e.message : "Load extraction failed."))
                .finally(() => setMmBusy(false));
            }}
          >
            Refresh result
          </button>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <span className="text-xs text-malv-text/70">Processing state</span>
          <StatusChip
            label={mmState === "idle" ? "Idle" : mmState === "queued" ? "Queued" : mmState === "processing" ? "Processing" : mmState === "done" ? "Done" : "Failed"}
            status={mmState === "failed" ? "failed" : mmState === "queued" ? "queued" : mmState === "processing" ? "running" : mmState === "done" ? "ok" : "neutral"}
          />
        </div>
        <details className="text-xs text-malv-text/50">
          <summary className="cursor-pointer text-malv-text/65">Optional dev harness (fixture rows)</summary>
          <p className="mt-2">
            Only if <code className="text-malv-text/70">MALV_DEV_HARNESS_ENABLED</code> is set on the API. Not production output.
          </p>
          <button
            type="button"
            className="mt-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs"
            disabled={!token || !selectedFileId || mmBusy}
            onClick={() => {
              if (!token || !selectedFileId) return;
              setMmBusy(true);
              void devHarnessMultimodalDeep(token, selectedFileId, "desktop_qa")
                .then(() => fetchMultimodalDeep(token, selectedFileId))
                .then((out) => setMultimodalPreview(out.extraction))
                .catch((e) => setErr(e instanceof Error ? e.message : "Harness failed."))
                .finally(() => setMmBusy(false));
            }}
          >
            Run dev harness fixture
          </button>
        </details>
        {multimodalPreview ? (
          <div className="space-y-2">
            {videoIntel ? (
              <div className="rounded-xl border border-cyan-400/25 bg-cyan-500/[0.06] p-3 text-[11px] text-cyan-100/90 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold">Uploaded video intelligence</div>
                  <button
                    type="button"
                    className="rounded-lg border border-cyan-300/35 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide"
                    onClick={() => askMalvAboutVideo(null)}
                  >
                    Ask MALV about this video
                  </button>
                </div>
                <div className="mt-1">
                  Duration: {videoIntel.durationSec != null ? `${Math.round(videoIntel.durationSec)}s` : "unknown"} · Resolution:{" "}
                  {videoIntel.width ?? "?"}x{videoIntel.height ?? "?"} · Timeline segments: {videoIntel.segments ?? "n/a"}
                </div>
                {intelligenceSummary ? <div className="rounded-lg border border-cyan-300/20 bg-black/20 px-2.5 py-2">{intelligenceSummary}</div> : null}
                {keyMoments.length ? (
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-cyan-100/70">Important moments</div>
                    <div className="flex flex-wrap gap-1.5">
                      {keyMoments.map((seg) => (
                        <button
                          key={`${seg.label}-${seg.tStartSec}`}
                          type="button"
                          className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-2 py-1 text-[10px]"
                          onClick={() => askMalvAboutVideo(seg)}
                        >
                          {seg.label} ({fmtSec(seg.tStartSec)}-{fmtSec(seg.tEndSec)})
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {detectedIssues.length ? (
                  <div className="rounded-lg border border-amber-300/25 bg-amber-400/10 px-2.5 py-2 text-amber-100/90">
                    <div className="text-[10px] uppercase tracking-wide">Possible issues</div>
                    <ul className="mt-1 space-y-0.5">
                      {detectedIssues.map((issue) => (
                        <li key={issue}>- {issue}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
            {videoIntel?.timeline.length ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="mb-2 text-xs font-semibold text-malv-text/85">Structured timeline</div>
                <div className="max-h-72 space-y-1.5 overflow-auto pr-1">
                  {videoIntel.timeline.map((seg, i) => {
                    const active = selectedSegmentIndex === i;
                    return (
                      <button
                        key={`${seg.label}-${seg.tStartSec}-${seg.tEndSec}`}
                        type="button"
                        onClick={() => setSelectedSegmentIndex(i)}
                        className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                          active ? "border-cyan-300/40 bg-cyan-500/15 text-cyan-50" : "border-white/10 bg-white/[0.02] text-malv-text/80"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{seg.label}</span>
                          <span className="font-mono text-[10px]">
                            {fmtSec(seg.tStartSec)} - {fmtSec(seg.tEndSec)}
                          </span>
                        </div>
                        {seg.explanation ? <p className="mt-1.5 text-[11px] text-malv-text/70 line-clamp-2">{seg.explanation}</p> : null}
                      </button>
                    );
                  })}
                </div>
                {selectedSegment ? (
                  <div className="mt-2 rounded-lg border border-cyan-300/25 bg-cyan-500/[0.08] p-2.5 text-xs text-cyan-50/90">
                    <div className="font-semibold">Selected segment</div>
                    <p className="mt-1">
                      {selectedSegment.label} ({fmtSec(selectedSegment.tStartSec)}-{fmtSec(selectedSegment.tEndSec)}).
                    </p>
                    {selectedSegment.thumbnailDataUrl ? (
                      <img
                        src={selectedSegment.thumbnailDataUrl}
                        alt={`${selectedSegment.label} keyframe`}
                        className="mt-2 h-28 w-full rounded-md border border-cyan-300/25 object-cover"
                        loading="lazy"
                      />
                    ) : null}
                    {selectedSegment.explanation ? <p className="mt-1.5 text-cyan-50/85">{selectedSegment.explanation}</p> : null}
                    {selectedSegment.visualSummary ? (
                      <p className="mt-1 rounded-md border border-cyan-300/20 bg-black/20 px-2 py-1.5 text-cyan-50/85">{selectedSegment.visualSummary}</p>
                    ) : null}
                    {selectedSegment.uiElements?.length ? (
                      <div className="mt-2">
                        <div className="text-[10px] uppercase tracking-wide text-cyan-100/70">UI elements</div>
                        <p className="mt-1 text-cyan-50/85">{selectedSegment.uiElements.slice(0, 5).join(", ")}</p>
                      </div>
                    ) : null}
                    {selectedSegment.keyObservations?.length ? (
                      <div className="mt-2">
                        <div className="text-[10px] uppercase tracking-wide text-cyan-100/70">Key observations</div>
                        <ul className="mt-1 space-y-0.5">
                          {selectedSegment.keyObservations.slice(0, 4).map((x) => (
                            <li key={x}>- {x}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {selectedSegment.visibleErrors?.length ? (
                      <div className="mt-2 rounded-md border border-red-300/30 bg-red-300/10 px-2 py-1.5 text-red-100">
                        <div className="text-[10px] uppercase tracking-wide">Visible issues</div>
                        <ul className="mt-1 space-y-0.5">
                          {selectedSegment.visibleErrors.slice(0, 3).map((x) => (
                            <li key={x}>- {x}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {selectedSegment.warnings?.length ? (
                      <div className="mt-2 rounded-md border border-amber-300/30 bg-amber-300/10 px-2 py-1.5 text-amber-100">
                        <div className="text-[10px] uppercase tracking-wide">Warnings</div>
                        <ul className="mt-1 space-y-0.5">
                          {selectedSegment.warnings.slice(0, 3).map((x) => (
                            <li key={x}>- {x}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className="mt-2 rounded-lg border border-cyan-300/35 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide"
                      onClick={() => askMalvAboutVideo(selectedSegment)}
                    >
                      Understand this segment with MALV
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            <details className="text-xs text-malv-text/55">
              <summary className="cursor-pointer">Raw extraction payload</summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-xl border border-white/10 bg-black/20 p-3 text-[11px] text-malv-text/80">
                {JSON.stringify(multimodalPreview, null, 2)}
              </pre>
            </details>
          </div>
        ) : null}
      </Card>

      <div className="space-y-2">
        <div className="text-[11px] font-mono uppercase tracking-wide text-malv-text/40">Your files</div>
        {files.length === 0 ? (
          <div className="text-sm text-malv-text/55">No files registered yet.</div>
        ) : (
          files.map((x) => (
            <Card key={x.id} variant="glass" className="p-3">
              <div className="font-semibold text-sm">{x.originalName}</div>
              <div className="text-xs text-malv-text/55 mt-1">
                {x.fileKind} · {x.id.slice(0, 8)}…
              </div>
            </Card>
          ))
        )}
      </div>
    </ModuleShell>
  );
}
