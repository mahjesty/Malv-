import { BadRequestException, ForbiddenException, forwardRef, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { Repository } from "typeorm";
import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { createHash } from "crypto";
import type { Dirent } from "fs";
import { KillSwitchService } from "../kill-switch/kill-switch.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { AiJobEntity } from "../db/entities/ai-job.entity";
import { FileEntity, type FileKind } from "../db/entities/file.entity";
import { MultimodalExtractionEntity, type MultimodalModality } from "../db/entities/multimodal-extraction.entity";
import { WorkspaceAccessService, type GlobalRole } from "../workspace/workspace-access.service";
import { MalvFeatureFlagsService } from "../common/malv-feature-flags.service";
import { BeastWorkerClient } from "../beast/client/beast-worker.client";
import { ObservabilityService } from "../common/observability.service";

type VideoTimelineSegment = { tStartSec: number; tEndSec: number; label: string };
type VideoSegmentIntelligence = VideoTimelineSegment & {
  explanation: string;
  keyObservations: string[];
  keyActions: string[];
  warnings?: string[];
  confidence: "low" | "medium" | "high";
  visualSummary?: string;
  uiElements?: string[];
  visibleErrors?: string[];
  thumbnailDataUrl?: string;
  debugSignals: {
    cutCount: number;
    blackFramesDetected: boolean;
    freezeDetected: boolean;
    rapidTransition: boolean;
  };
};

type FrameMarker = "start" | "middle" | "transition";
type CachedFrameRef = { marker: FrameMarker; atSec: number; cacheRef: string };

const EXTRACTION_PIPELINE_VERSION = "malv-multimodal-1";
const VIDEO_CACHE_SCHEMA_VERSION = "video-cache-v1";

type ImageSizeFn = (buffer: Buffer) => { width?: number; height?: number; type?: string };
let imageSizeModule: ImageSizeFn | null = null;
async function loadImageSize(): Promise<ImageSizeFn | null> {
  if (imageSizeModule) return imageSizeModule;
  try {
    const mod = await import("image-size");
    imageSizeModule = (mod as any).default ?? (mod as any).imageSize;
    return imageSizeModule;
  } catch {
    return null;
  }
}

@Injectable()
export class MultimodalDeepExtractService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MultimodalDeepExtractService.name);
  private cacheCleanupTimer: NodeJS.Timeout | null = null;
  private cacheCleanupInFlight = false;

  constructor(
    private readonly cfg: ConfigService,
    private readonly flags: MalvFeatureFlagsService,
    private readonly killSwitch: KillSwitchService,
    @Inject(forwardRef(() => RealtimeGateway)) private readonly realtime: RealtimeGateway,
    private readonly workspaceAccess: WorkspaceAccessService,
    private readonly beastWorker: BeastWorkerClient,
    private readonly observability: ObservabilityService,
    @InjectRepository(MultimodalExtractionEntity) private readonly extractions: Repository<MultimodalExtractionEntity>,
    @InjectRepository(FileEntity) private readonly files: Repository<FileEntity>,
    @InjectRepository(AiJobEntity) private readonly aiJobs: Repository<AiJobEntity>
  ) {}

  private storageRoot(): string {
    return this.cfg.get<string>("PRIVATE_STORAGE_ROOT") ?? "/tmp/malv-storage";
  }

  private processTimeoutMs(envKey: string, fallback: number): number {
    const raw = Number(this.cfg.get<string>(envKey) ?? fallback);
    if (!Number.isFinite(raw)) return fallback;
    return Math.max(1000, Math.min(180_000, Math.floor(raw)));
  }

  private async runProcessWithTimeout(args: {
    command: string;
    commandArgs: string[];
    timeoutMs: number;
    cwd?: string;
    collectStdout?: boolean;
  }): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
    return await new Promise((resolve) => {
      const child = spawn(args.command, args.commandArgs, { env: process.env, cwd: args.cwd });
      let stdout = "";
      let stderr = "";
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        child.kill("SIGKILL");
        resolve({ code: 124, stdout, stderr: `${stderr}\n[timeout after ${args.timeoutMs}ms]`, timedOut: true });
      }, args.timeoutMs);
      child.stdout.on("data", (d) => {
        if (args.collectStdout ?? true) stdout += d.toString();
      });
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("error", (e) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ code: 1, stdout, stderr: `${stderr}\n${e.message}`, timedOut: false });
      });
      child.on("close", (code) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ code, stdout, stderr, timedOut: false });
      });
    });
  }

  private async resolvePrivateStoragePath(storageUri: string): Promise<{ resolvedPath: string; relForDebug: string }> {
    const root = path.resolve(this.storageRoot());
    const cleaned = storageUri.replace(/^[\\/]+/, "");
    if (cleaned.includes("..")) {
      throw new BadRequestException("Invalid storage URI.");
    }
    const resolvedPath = path.resolve(root, cleaned);
    if (!resolvedPath.startsWith(root + path.sep) && resolvedPath !== root) {
      throw new BadRequestException("Storage URI outside allowed root.");
    }
    const canonicalRoot = await fs.realpath(root).catch(() => null);
    const canonicalPath = await fs.realpath(resolvedPath).catch(() => null);
    if (!canonicalRoot || !canonicalPath) throw new BadRequestException("Storage path not found.");
    if (!canonicalPath.startsWith(canonicalRoot + path.sep)) {
      throw new BadRequestException("Storage URI outside allowed root.");
    }
    const lst = await fs.lstat(canonicalPath).catch(() => null);
    if (!lst || lst.isSymbolicLink()) throw new BadRequestException("Storage URI is invalid.");
    return { resolvedPath: canonicalPath, relForDebug: cleaned };
  }

  private modalityFromKind(kind: FileKind): MultimodalModality {
    if (kind === "pdf") return "pdf";
    if (kind === "image") return "image";
    if (kind === "audio") return "audio";
    if (kind === "video") return "video";
    return "other";
  }

  private videoExtractionLimits(): { maxSegmentsAnalyzed: number; maxFramesPerSegment: number } {
    const maxSegmentsAnalyzedRaw = Number(this.cfg.get<string>("MALV_VIDEO_MAX_SEGMENTS_ANALYZED") ?? "12");
    const maxFramesPerSegmentRaw = Number(this.cfg.get<string>("MALV_VIDEO_MAX_FRAMES_PER_SEGMENT") ?? "3");
    const maxSegmentsAnalyzed = Number.isFinite(maxSegmentsAnalyzedRaw) ? Math.max(1, Math.min(24, Math.floor(maxSegmentsAnalyzedRaw))) : 12;
    const maxFramesPerSegment = Number.isFinite(maxFramesPerSegmentRaw) ? Math.max(1, Math.min(5, Math.floor(maxFramesPerSegmentRaw))) : 3;
    return { maxSegmentsAnalyzed, maxFramesPerSegment };
  }

  private videoCacheRoot(): string {
    return path.resolve(this.storageRoot(), ".cache", "video-intelligence", VIDEO_CACHE_SCHEMA_VERSION);
  }

  private videoCacheLifecycleConfig(): { ttlMs: number; maxBytes: number; cleanupIntervalMs: number } {
    const ttlDaysRaw = Number(this.cfg.get<string>("MALV_VIDEO_CACHE_TTL_DAYS") ?? "7");
    const maxGbRaw = Number(this.cfg.get<string>("MALV_VIDEO_CACHE_MAX_GB") ?? "2");
    const intervalMinRaw = Number(this.cfg.get<string>("MALV_VIDEO_CACHE_CLEANUP_INTERVAL_MINUTES") ?? "30");
    const ttlDays = Number.isFinite(ttlDaysRaw) ? Math.max(1, Math.min(90, Math.floor(ttlDaysRaw))) : 7;
    const maxGb = Number.isFinite(maxGbRaw) ? Math.max(1, Math.min(50, maxGbRaw)) : 2;
    const intervalMin = Number.isFinite(intervalMinRaw) ? Math.max(5, Math.min(1440, Math.floor(intervalMinRaw))) : 30;
    return {
      ttlMs: ttlDays * 24 * 60 * 60 * 1000,
      maxBytes: Math.floor(maxGb * 1024 * 1024 * 1024),
      cleanupIntervalMs: intervalMin * 60 * 1000
    };
  }

  onModuleInit(): void {
    const { cleanupIntervalMs } = this.videoCacheLifecycleConfig();
    this.cacheCleanupTimer = setInterval(() => {
      void this.runCacheCleanup("periodic");
    }, cleanupIntervalMs);
    this.cacheCleanupTimer.unref?.();
    void this.runCacheCleanup("startup");
  }

  onModuleDestroy(): void {
    if (this.cacheCleanupTimer) {
      clearInterval(this.cacheCleanupTimer);
      this.cacheCleanupTimer = null;
    }
  }

  private async yieldToEventLoop(): Promise<void> {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  private async removeFileSafe(absPath: string): Promise<boolean> {
    try {
      await fs.rm(absPath, { force: true });
      return true;
    } catch {
      return false;
    }
  }

  private async runCacheCleanup(trigger: "startup" | "periodic"): Promise<void> {
    if (this.cacheCleanupInFlight) return;
    this.cacheCleanupInFlight = true;
    const started = Date.now();
    try {
      const root = this.videoCacheRoot();
      const cfg = this.videoCacheLifecycleConfig();
      let entries: Array<{ path: string; size: number; mtimeMs: number }> = [];
      try {
        entries = await this.listCacheFiles(root);
      } catch {
        entries = [];
      }
      const now = Date.now();
      let deletedCount = 0;
      let deletedBytes = 0;
      let scannedCount = 0;
      let remainingBytes = 0;

      const byMtimeAsc = [...entries].sort((a, b) => a.mtimeMs - b.mtimeMs);
      const keep: Array<{ path: string; size: number; mtimeMs: number }> = [];
      for (const e of byMtimeAsc) {
        scannedCount += 1;
        if (now - e.mtimeMs > cfg.ttlMs) {
          const ok = await this.removeFileSafe(e.path);
          if (ok) {
            deletedCount += 1;
            deletedBytes += e.size;
          }
        } else {
          keep.push(e);
          remainingBytes += e.size;
        }
        if (scannedCount % 200 === 0) {
          await this.yieldToEventLoop();
        }
      }

      if (remainingBytes > cfg.maxBytes) {
        for (const e of keep) {
          if (remainingBytes <= cfg.maxBytes) break;
          const ok = await this.removeFileSafe(e.path);
          if (!ok) continue;
          deletedCount += 1;
          deletedBytes += e.size;
          remainingBytes -= e.size;
          if (deletedCount % 200 === 0) {
            await this.yieldToEventLoop();
          }
        }
      }

      this.logger.log(
        `video-cache cleanup trigger=${trigger} scanned=${scannedCount} deleted=${deletedCount} deletedBytes=${deletedBytes} remainingBytes=${Math.max(
          0,
          remainingBytes
        )} ttlMs=${cfg.ttlMs} maxBytes=${cfg.maxBytes} elapsedMs=${Date.now() - started}`
      );
    } catch (e) {
      this.logger.warn(`video-cache cleanup failed trigger=${trigger}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.cacheCleanupInFlight = false;
    }
  }

  private async listCacheFiles(root: string): Promise<Array<{ path: string; size: number; mtimeMs: number }>> {
    const out: Array<{ path: string; size: number; mtimeMs: number }> = [];
    const walk = async (dir: string): Promise<void> => {
      let rows: Dirent[];
      try {
        rows = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const row of rows) {
        const abs = path.join(dir, row.name);
        if (row.isDirectory()) {
          await walk(abs);
          continue;
        }
        if (!row.isFile()) continue;
        if (row.name.includes(".tmp-")) continue;
        try {
          const st = await fs.stat(abs);
          out.push({ path: abs, size: st.size, mtimeMs: st.mtimeMs });
        } catch {
          // Ignore disappearing files.
        }
      }
    };
    await walk(root);
    return out;
  }

  private sanitizeCachePart(input: string): string {
    return input.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "unknown";
  }

  private frameCacheRef(args: {
    namespaceKey: string;
    fileChecksum: string;
    processorVersion: string;
    segmentIndex: number;
    marker: FrameMarker;
    atSec: number;
  }): string {
    const ts = args.atSec.toFixed(3).replace(".", "_");
    return path.posix.join(
      this.sanitizeCachePart(args.namespaceKey),
      this.sanitizeCachePart(args.processorVersion),
      this.sanitizeCachePart(args.fileChecksum),
      `seg_${args.segmentIndex}`,
      `${args.marker}_${ts}.jpg`
    );
  }

  private frameCacheAbsPath(cacheRef: string): string {
    return path.resolve(this.videoCacheRoot(), ...cacheRef.split("/"));
  }

  private async writeFileAtomic(absPath: string, contents: string | Buffer): Promise<void> {
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    const tmp = `${absPath}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await fs.writeFile(tmp, contents);
    await fs.rename(tmp, absPath);
  }

  private async getOrExtractCachedFrame(args: {
    namespaceKey: string;
    resolvedPath: string;
    fileChecksum: string;
    processorVersion: string;
    segmentIndex: number;
    marker: FrameMarker;
    atSec: number;
  }): Promise<CachedFrameRef | null> {
    const cacheRef = this.frameCacheRef(args);
    const absPath = this.frameCacheAbsPath(cacheRef);
    try {
      await fs.access(absPath);
      this.logger.debug(`video-cache frame hit key=${cacheRef}`);
      return { marker: args.marker, atSec: args.atSec, cacheRef };
    } catch {
      // Cache miss, continue to extraction.
    }
    this.logger.debug(`video-cache frame miss key=${cacheRef}`);
    const buf = await this.extractJpegFrameBuffer({ resolvedPath: args.resolvedPath, sec: args.atSec });
    if (!buf) return null;
    await this.writeFileAtomic(absPath, buf);
    return { marker: args.marker, atSec: args.atSec, cacheRef };
  }

  private async loadFrameDataUrl(cacheRef: string): Promise<string | null> {
    try {
      const absPath = this.frameCacheAbsPath(cacheRef);
      const buf = await fs.readFile(absPath);
      return this.compactDataUrlBase64(buf);
    } catch {
      return null;
    }
  }

  private segmentVisionCacheRef(args: {
    namespaceKey: string;
    fileChecksum: string;
    processorVersion: string;
    segmentIndex: number;
    seg: VideoTimelineSegment;
    frameRefs: string[];
  }): string {
    const fp = createHash("sha256")
      .update(
        JSON.stringify({
          segmentIndex: args.segmentIndex,
          tStartSec: Number(args.seg.tStartSec.toFixed(3)),
          tEndSec: Number(args.seg.tEndSec.toFixed(3)),
          frameRefs: [...args.frameRefs].sort()
        })
      )
      .digest("hex")
      .slice(0, 20);
    return path.posix.join(
      this.sanitizeCachePart(args.namespaceKey),
      this.sanitizeCachePart(args.processorVersion),
      this.sanitizeCachePart(args.fileChecksum),
      "vision",
      `seg_${args.segmentIndex}_${fp}.json`
    );
  }

  private segmentVisionCacheAbsPath(cacheRef: string): string {
    return path.resolve(this.videoCacheRoot(), ...cacheRef.split("/"));
  }

  private async tryReadVisionCache(cacheRef: string): Promise<Record<string, unknown> | null> {
    try {
      const absPath = this.segmentVisionCacheAbsPath(cacheRef);
      const raw = await fs.readFile(absPath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
      return null;
    } catch {
      return null;
    }
  }

  private async writeVisionCache(cacheRef: string, payload: Record<string, unknown>): Promise<void> {
    const absPath = this.segmentVisionCacheAbsPath(cacheRef);
    await this.writeFileAtomic(absPath, JSON.stringify(payload));
  }

  private resolveFileChecksum(_file: FileEntity, buf: Buffer): string {
    return createHash("sha256").update(buf).digest("hex");
  }

  private buildVideoTimeline(durationSec?: number | null): Array<{ tStartSec: number; tEndSec: number; label: string }> {
    if (!durationSec || durationSec <= 0) return [];
    const safeDuration = Math.max(1, Math.floor(durationSec));
    const targetSegments = safeDuration > 600 ? 10 : safeDuration > 180 ? 8 : safeDuration > 60 ? 6 : 4;
    const segLen = Math.max(8, Math.floor(safeDuration / targetSegments));
    const out: Array<{ tStartSec: number; tEndSec: number; label: string }> = [];
    let t = 0;
    while (t < safeDuration) {
      const end = Math.min(safeDuration, t + segLen);
      out.push({
        tStartSec: t,
        tEndSec: end,
        label: `scene_${out.length + 1}`
      });
      t = end;
    }
    return out.slice(0, this.videoExtractionLimits().maxSegmentsAnalyzed);
  }

  private parseTimeMarker(secRaw: string | undefined): number | null {
    if (!secRaw) return null;
    const n = Number(secRaw);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  }

  private overlapsWindow(startSec: number | null, endSec: number | null, seg: VideoTimelineSegment): boolean {
    if (startSec == null && endSec == null) return false;
    const s = startSec ?? endSec ?? seg.tStartSec;
    const e = endSec ?? startSec ?? seg.tEndSec;
    return !(e < seg.tStartSec || s > seg.tEndSec);
  }

  private async detectSceneCuts(resolvedPath: string): Promise<number[]> {
    try {
      const out = await this.runProcessWithTimeout({
        command: "ffprobe",
        commandArgs: ["-v", "error", "-f", "lavfi", "-i", `movie=${resolvedPath.replace(/:/g, "\\:")},select=gt(scene\\,0.35)`, "-show_entries", "frame=pts_time", "-of", "csv=p=0"],
        timeoutMs: this.processTimeoutMs("MALV_FFPROBE_SCENE_TIMEOUT_MS", 20_000)
      });
      if (out.timedOut) return [];
      return out
        .stdout.split(/\r?\n/)
        .map((line) => this.parseTimeMarker(line.trim()))
        .filter((v): v is number => typeof v === "number");
    } catch {
      return [];
    }
  }

  private async detectVideoQualityEvents(
    resolvedPath: string
  ): Promise<{ blackIntervals: Array<{ startSec: number; endSec: number }>; freezeIntervals: Array<{ startSec: number; endSec: number }> }> {
    try {
      const out = await this.runProcessWithTimeout({
        command: "ffmpeg",
        commandArgs: ["-hide_banner", "-nostats", "-i", resolvedPath, "-vf", "blackdetect=d=0.4:pic_th=0.98,freezedetect=n=-50dB:d=0.8", "-an", "-f", "null", "-"],
        timeoutMs: this.processTimeoutMs("MALV_FFMPEG_QUALITY_TIMEOUT_MS", 30_000)
      });
      if (out.timedOut) return { blackIntervals: [], freezeIntervals: [] };
      const blackIntervals: Array<{ startSec: number; endSec: number }> = [];
      const freezeIntervals: Array<{ startSec: number; endSec: number }> = [];
      const lines = `${out.stdout}\n${out.stderr}`.split(/\r?\n/);
      for (const line of lines) {
        const black = line.match(/black_start:(\d+(?:\.\d+)?)\s+black_end:(\d+(?:\.\d+)?)/);
        if (black) {
          blackIntervals.push({ startSec: Number(black[1]), endSec: Number(black[2]) });
        }
        const freeze = line.match(/freeze_start:\s*(\d+(?:\.\d+)?)\s+freeze_end:\s*(\d+(?:\.\d+)?)/);
        if (freeze) {
          freezeIntervals.push({ startSec: Number(freeze[1]), endSec: Number(freeze[2]) });
        }
      }
      return { blackIntervals, freezeIntervals };
    } catch {
      return { blackIntervals: [], freezeIntervals: [] };
    }
  }

  private compactDataUrlBase64(buf: Buffer): string {
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  }

  private clampFrameTime(sec: number, seg: VideoTimelineSegment): number {
    const eps = 0.05;
    return Math.max(seg.tStartSec + eps, Math.min(seg.tEndSec - eps, sec));
  }

  private transitionFramesForSegment(seg: VideoTimelineSegment, sceneCutTimes: number[]): number[] {
    const internalCuts = sceneCutTimes.filter((t) => t > seg.tStartSec && t < seg.tEndSec);
    if (!internalCuts.length) return [];
    const mid = seg.tStartSec + (seg.tEndSec - seg.tStartSec) / 2;
    const closest = [...internalCuts].sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0];
    return typeof closest === "number" ? [closest] : [];
  }

  private async extractJpegFrameBuffer(args: { resolvedPath: string; sec: number; maxWidth?: number }): Promise<Buffer | null> {
    const width = args.maxWidth ?? 640;
    const timeoutMs = this.processTimeoutMs("MALV_FFMPEG_FRAME_TIMEOUT_MS", 15_000);
    const ff = await new Promise<Buffer | null>((resolve) => {
      const p = spawn(
        "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-ss",
          `${Math.max(0, args.sec)}`,
          "-i",
          args.resolvedPath,
          "-frames:v",
          "1",
          "-vf",
          `scale='min(${width},iw)':-2`,
          "-f",
          "image2pipe",
          "-vcodec",
          "mjpeg",
          "pipe:1"
        ],
        { env: process.env }
      );
      const chunks: Buffer[] = [];
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        p.kill("SIGKILL");
        resolve(null);
      }, timeoutMs);
      p.stdout.on("data", (d) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
      p.stderr.on("data", () => void 0);
      p.on("error", () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(null);
      });
      p.on("close", (code) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (code !== 0 || chunks.length === 0) return resolve(null);
        resolve(Buffer.concat(chunks));
      });
    });
    return ff;
  }

  private async extractSegmentKeyframes(args: {
    namespaceKey: string;
    resolvedPath: string;
    fileChecksum: string;
    processorVersion: string;
    timeline: VideoTimelineSegment[];
    sceneCutTimes: number[];
  }): Promise<Array<{ segmentIndex: number; frames: CachedFrameRef[] }>> {
    const out: Array<{ segmentIndex: number; frames: CachedFrameRef[] }> = [];
    const limits = this.videoExtractionLimits();
    for (let i = 0; i < args.timeline.length; i += 1) {
      const seg = args.timeline[i]!;
      const mid = seg.tStartSec + (seg.tEndSec - seg.tStartSec) / 2;
      const transition = this.transitionFramesForSegment(seg, args.sceneCutTimes);
      const transitionPicks: Array<{ marker: FrameMarker; atSec: number }> = transition.map((t) => ({
        marker: "transition",
        atSec: this.clampFrameTime(t, seg)
      }));
      const picks = [
        { marker: "start", atSec: this.clampFrameTime(seg.tStartSec, seg) },
        { marker: "middle", atSec: this.clampFrameTime(mid, seg) },
        ...transitionPicks
      ].slice(0, limits.maxFramesPerSegment) as Array<{ marker: FrameMarker; atSec: number }>;
      const frames: CachedFrameRef[] = [];
      for (const p of picks) {
        const cached = await this.getOrExtractCachedFrame({
          namespaceKey: args.namespaceKey,
          resolvedPath: args.resolvedPath,
          fileChecksum: args.fileChecksum,
          processorVersion: args.processorVersion,
          segmentIndex: i,
          marker: p.marker,
          atSec: p.atSec
        });
        if (!cached) continue;
        frames.push(cached);
      }
      out.push({ segmentIndex: i, frames });
    }
    return out;
  }

  private parseVisualSegments(raw: string): Array<Partial<VideoSegmentIntelligence>> {
    const text = raw.trim();
    if (!text) return [];
    const fenced = text.match(/```json\s*([\s\S]*?)```/i);
    const candidate = fenced?.[1] ?? text;
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed as Array<Partial<VideoSegmentIntelligence>>;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return [parsed as Partial<VideoSegmentIntelligence>];
      if (parsed && Array.isArray((parsed as any).segments)) return (parsed as any).segments as Array<Partial<VideoSegmentIntelligence>>;
      return [];
    } catch {
      return [];
    }
  }

  private buildVisualAnalysisMessages(args: {
    fileName: string;
    seg: VideoSegmentIntelligence;
    frames: Array<{ marker: "start" | "middle" | "transition"; atSec: number; dataUrl: string }>;
  }): Array<Record<string, unknown>> {
    const userContent: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: [
          "Analyze this UI video segment with debugging focus.",
          `File: ${args.fileName}`,
          `Segment: ${args.seg.label} (${args.seg.tStartSec.toFixed(2)}s-${args.seg.tEndSec.toFixed(2)}s)`,
          `Diagnostics: ${JSON.stringify(args.seg.debugSignals)}`,
          "Return strict JSON object with keys:",
          "{ visualSummary, uiElements[], userActions[], visibleErrors[], warnings[] }",
          "No markdown."
        ].join("\n")
      }
    ];
    for (const frame of args.frames) {
      userContent.push({
        type: "text",
        text: `Frame marker=${frame.marker} at ${frame.atSec.toFixed(2)}s`
      });
      userContent.push({
        type: "image_url",
        image_url: { url: frame.dataUrl }
      });
    }
    return [
      {
        role: "system",
        content:
          "You are MALV multimodal UI debugging analyst. Use only visible evidence from frames and provided diagnostics. Keep outputs concise and actionable."
      },
      {
        role: "user",
        content: userContent
      }
    ];
  }

  private buildVideoReasoningPrompt(args: { fileName: string; durationSec?: number | null; segments: Array<Record<string, unknown>> }): string {
    return [
      "You are MALV video analyst.",
      "Task: explain each segment with practical debugging insight.",
      "Rules:",
      "- Use only supplied extraction evidence.",
      "- Do not invent visual details not supported by evidence.",
      "- For each segment, provide concise explanation, actions/events, observations, and possible issues.",
      "- Focus on UI state gaps, broken flow hints, abnormal transitions, and unclear user action points.",
      "",
      `Video: ${args.fileName}`,
      `DurationSec: ${args.durationSec ?? "unknown"}`,
      "Segments (JSON):",
      JSON.stringify(args.segments)
    ].join("\n");
  }

  private parseReasonedSegments(raw: string): Array<Partial<VideoSegmentIntelligence>> {
    const text = raw.trim();
    if (!text) return [];
    const fenced = text.match(/```json\s*([\s\S]*?)```/i);
    const candidate = fenced?.[1] ?? text;
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed as Array<Partial<VideoSegmentIntelligence>>;
      if (parsed && Array.isArray((parsed as any).segments)) return (parsed as any).segments as Array<Partial<VideoSegmentIntelligence>>;
      return [];
    } catch {
      return [];
    }
  }

  private async buildVideoSegmentIntelligence(args: {
    namespaceKey: string;
    resolvedPath: string;
    fileChecksum: string;
    processorVersion: string;
    fileName: string;
    durationSec?: number | null;
    timeline: VideoTimelineSegment[];
  }): Promise<VideoSegmentIntelligence[]> {
    const [sceneCutTimes, qualityEvents] = await Promise.all([
      this.detectSceneCuts(args.resolvedPath),
      this.detectVideoQualityEvents(args.resolvedPath)
    ]);
    const roughSegments = args.timeline.map((seg) => {
      const cutCount = sceneCutTimes.filter((t) => t >= seg.tStartSec && t <= seg.tEndSec).length;
      const blackFramesDetected = qualityEvents.blackIntervals.some((x) => this.overlapsWindow(x.startSec, x.endSec, seg));
      const freezeDetected = qualityEvents.freezeIntervals.some((x) => this.overlapsWindow(x.startSec, x.endSec, seg));
      const rapidTransition = cutCount >= 3 && seg.tEndSec - seg.tStartSec <= 15;
      const warnings: string[] = [];
      if (blackFramesDetected) warnings.push("Potential blank/black UI interval.");
      if (freezeDetected) warnings.push("Potential frozen frame or stalled UI.");
      if (rapidTransition) warnings.push("Rapid transition cluster; possible unstable navigation.");
      return {
        ...seg,
        explanation: "Segment extracted from real timeline and media diagnostics.",
        keyObservations: [
          `Duration ${(seg.tEndSec - seg.tStartSec).toFixed(1)}s`,
          `${cutCount} detected scene transition${cutCount === 1 ? "" : "s"}`
        ],
        keyActions: ["Observe transition pattern", "Validate expected UI state change"],
        warnings,
        confidence: warnings.length ? "medium" : "low",
        visualSummary: undefined,
        uiElements: [],
        visibleErrors: [],
        thumbnailDataUrl: undefined,
        debugSignals: { cutCount, blackFramesDetected, freezeDetected, rapidTransition }
      } satisfies VideoSegmentIntelligence;
    });

    const keyframes = await this.extractSegmentKeyframes({
      namespaceKey: args.namespaceKey,
      resolvedPath: args.resolvedPath,
      fileChecksum: args.fileChecksum,
      processorVersion: args.processorVersion,
      timeline: args.timeline,
      sceneCutTimes
    });

    const frameBySegment = new Map<number, CachedFrameRef[]>();
    for (const row of keyframes) frameBySegment.set(row.segmentIndex, row.frames);

    let reasonedSegments: Array<Partial<VideoSegmentIntelligence>> = [];
    try {
      const prompt = this.buildVideoReasoningPrompt({
        fileName: args.fileName,
        durationSec: args.durationSec,
        segments: roughSegments.map((s) => ({
          label: s.label,
          tStartSec: s.tStartSec,
          tEndSec: s.tEndSec,
          debugSignals: s.debugSignals,
          warnings: s.warnings
        }))
      });
      const worker = await this.beastWorker.infer({
        mode: "beast",
        prompt,
        context: {
          malvPromptAlreadyExpanded: true,
          malvOperatorMode: "analyze",
          videoReasoning: true
        }
      });
      reasonedSegments = this.parseReasonedSegments(worker.reply ?? "");
    } catch (e) {
      this.logger.warn(`video reasoning infer skipped: ${e instanceof Error ? e.message : String(e)}`);
    }

    const visualSegments: Array<Partial<VideoSegmentIntelligence>> = [];
    for (let i = 0; i < roughSegments.length; i += 1) {
      const seg = roughSegments[i]!;
      const frameRefs = frameBySegment.get(i) ?? [];
      if (!frameRefs.length) {
        visualSegments.push({});
        continue;
      }
      const visionCacheRef = this.segmentVisionCacheRef({
        namespaceKey: args.namespaceKey,
        fileChecksum: args.fileChecksum,
        processorVersion: args.processorVersion,
        segmentIndex: i,
        seg,
        frameRefs: frameRefs.map((f) => f.cacheRef)
      });
      const cachedVision = await this.tryReadVisionCache(visionCacheRef);
      this.logger.debug(`video-cache vision ${cachedVision ? "hit" : "miss"} key=${visionCacheRef}`);
      const thumbDataUrlFromCache = await this.loadFrameDataUrl(frameRefs[0]!.cacheRef);
      if (cachedVision) {
        visualSegments.push({
          visualSummary: typeof cachedVision.visualSummary === "string" ? cachedVision.visualSummary : undefined,
          uiElements: Array.isArray(cachedVision.uiElements)
            ? cachedVision.uiElements.filter((x: unknown): x is string => typeof x === "string").slice(0, 6)
            : [],
          keyActions: Array.isArray(cachedVision.keyActions)
            ? cachedVision.keyActions.filter((x: unknown): x is string => typeof x === "string").slice(0, 5)
            : [],
          visibleErrors: Array.isArray(cachedVision.visibleErrors)
            ? cachedVision.visibleErrors.filter((x: unknown): x is string => typeof x === "string").slice(0, 4)
            : [],
          warnings: Array.isArray(cachedVision.warnings)
            ? cachedVision.warnings.filter((x: unknown): x is string => typeof x === "string").slice(0, 4)
            : [],
          thumbnailDataUrl: thumbDataUrlFromCache ?? undefined
        });
        continue;
      }
      const frames: Array<{ marker: FrameMarker; atSec: number; dataUrl: string }> = [];
      for (const frameRef of frameRefs) {
        const dataUrl = await this.loadFrameDataUrl(frameRef.cacheRef);
        if (!dataUrl) continue;
        frames.push({ marker: frameRef.marker, atSec: frameRef.atSec, dataUrl });
      }
      if (!frames.length) {
        visualSegments.push({ thumbnailDataUrl: thumbDataUrlFromCache ?? undefined });
        continue;
      }
      try {
        const worker = await this.beastWorker.infer({
          mode: "beast",
          prompt: `Visual segment analysis for ${args.fileName} ${seg.label}`,
          context: {
            malvPromptAlreadyExpanded: true,
            malvOperatorMode: "analyze",
            malvInferenceBackend: "openai_compatible",
            messages: this.buildVisualAnalysisMessages({ fileName: args.fileName, seg, frames }),
            inputMode: "video",
            videoVision: true
          }
        });
        const parsed = this.parseVisualSegments(worker.reply ?? "");
        const first = parsed[0] ?? {};
        const visualResult = {
          visualSummary: typeof first.visualSummary === "string" ? first.visualSummary.trim() : undefined,
          uiElements: Array.isArray((first as any).uiElements)
            ? (first as any).uiElements.filter((x: unknown): x is string => typeof x === "string").slice(0, 6)
            : [],
          keyActions: Array.isArray((first as any).userActions)
            ? (first as any).userActions.filter((x: unknown): x is string => typeof x === "string").slice(0, 5)
            : [],
          visibleErrors: Array.isArray((first as any).visibleErrors)
            ? (first as any).visibleErrors.filter((x: unknown): x is string => typeof x === "string").slice(0, 4)
            : [],
          warnings: Array.isArray((first as any).warnings)
            ? (first as any).warnings.filter((x: unknown): x is string => typeof x === "string").slice(0, 4)
            : [],
          thumbnailDataUrl: frames[0]?.dataUrl
        };
        await this.writeVisionCache(visionCacheRef, {
          visualSummary: visualResult.visualSummary ?? null,
          uiElements: visualResult.uiElements,
          keyActions: visualResult.keyActions,
          visibleErrors: visualResult.visibleErrors,
          warnings: visualResult.warnings
        });
        visualSegments.push(visualResult);
      } catch (e) {
        this.observability.incVideoFailure("vision_infer");
        this.logger.warn(
          JSON.stringify({
            tag: "video.vision.infer_failed",
            segmentLabel: seg.label,
            fileName: args.fileName,
            error: e instanceof Error ? e.message : String(e)
          })
        );
        visualSegments.push({ thumbnailDataUrl: frames[0]?.dataUrl });
      }
    }

    return roughSegments.map((base, idx) => {
      const candidate = reasonedSegments[idx] ?? {};
      const visual = visualSegments[idx] ?? {};
      const explanation =
        typeof candidate.explanation === "string" && candidate.explanation.trim().length > 0 ? candidate.explanation.trim() : base.explanation;
      const keyObservations =
        Array.isArray(candidate.keyObservations) && candidate.keyObservations.length
          ? candidate.keyObservations.filter((x): x is string => typeof x === "string").slice(0, 5)
          : base.keyObservations;
      const keyActions =
        Array.isArray(candidate.keyActions) && candidate.keyActions.length
          ? candidate.keyActions.filter((x): x is string => typeof x === "string").slice(0, 5)
          : base.keyActions;
      const keyActionsMerged = Array.from(
        new Set([
          ...keyActions,
          ...(Array.isArray(visual.keyActions) ? visual.keyActions.filter((x): x is string => typeof x === "string") : [])
        ])
      ).slice(0, 6);
      const warnings =
        Array.isArray(candidate.warnings) && candidate.warnings.length
          ? candidate.warnings.filter((x): x is string => typeof x === "string").slice(0, 4)
          : base.warnings;
      const warningsMerged = Array.from(
        new Set([
          ...(warnings ?? []),
          ...(Array.isArray(visual.warnings) ? visual.warnings.filter((x): x is string => typeof x === "string") : []),
          ...(Array.isArray(visual.visibleErrors) ? visual.visibleErrors.filter((x): x is string => typeof x === "string") : [])
        ])
      ).slice(0, 5);
      const visualSummary = typeof visual.visualSummary === "string" && visual.visualSummary ? visual.visualSummary : undefined;
      const uiElements = Array.isArray(visual.uiElements) ? visual.uiElements.filter((x): x is string => typeof x === "string").slice(0, 6) : [];
      const visibleErrors = Array.isArray(visual.visibleErrors)
        ? visual.visibleErrors.filter((x): x is string => typeof x === "string").slice(0, 4)
        : [];
      const observationMerged = Array.from(
        new Set([
          ...keyObservations,
          ...(visualSummary ? [`Visual: ${visualSummary}`] : []),
          ...(uiElements.length ? [`UI elements: ${uiElements.join(", ")}`] : [])
        ])
      ).slice(0, 6);
      const fullExplanation = visualSummary ? `${explanation} ${visualSummary}`.trim() : explanation;
      const confidence =
        candidate.confidence === "high" || candidate.confidence === "medium" || candidate.confidence === "low"
          ? candidate.confidence
          : base.confidence;
      return {
        ...base,
        explanation: fullExplanation,
        keyObservations: observationMerged,
        keyActions: keyActionsMerged,
        warnings: warningsMerged,
        confidence,
        visualSummary,
        uiElements,
        visibleErrors,
        thumbnailDataUrl: typeof visual.thumbnailDataUrl === "string" ? visual.thumbnailDataUrl : undefined
      };
    });
  }

  /**
   * Dev-harness only: synthetic fixture rows for QA — never the production extraction path.
   */
  private buildDevHarnessFixtureUnified(modality: MultimodalModality, scenario: string, fileName: string) {
    if (modality === "video") {
      const timeline = this.buildVideoTimeline(142);
      return {
        source: "dev_harness_fixture",
        modality,
        scenario,
        summary: "Dev harness fixture (not real media analysis).",
        video: {
          durationSec: 142,
          timeline,
          note: "Replace with worker vision pipeline when connected."
        },
        confidence: "fixture_only"
      };
    }
    if (modality === "pdf") {
      return {
        source: "dev_harness_fixture",
        modality,
        scenario,
        summary: "Dev harness fixture (not real PDF text).",
        pdf: {
          pageCount: 12,
          keyPoints: ["Fixture only — use real upload + POST /v1/files/:id/multimodal/deep for production."],
          citationAnchors: [{ page: 2, citationId: "p2" }]
        },
        confidence: "fixture_only"
      };
    }
    if (modality === "image") {
      return {
        source: "dev_harness_fixture",
        modality,
        scenario,
        summary: "Dev harness fixture (not real vision).",
        image: {
          dimensions: { width: 1920, height: 1080 },
          note: "Fixture only — real path uses image bytes + model/worker."
        },
        confidence: "fixture_only"
      };
    }
    return {
      source: "dev_harness_fixture",
      modality,
      scenario,
      summary: `Dev harness fixture for ${fileName}.`,
      confidence: "fixture_only"
    };
  }

  async enqueueDeepExtraction(args: {
    userId: string;
    globalRole: GlobalRole;
    fileId: string;
    workspaceId?: string | null;
  }): Promise<{ aiJobId: string; extractionId: string }> {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "multimodal_enqueue" });
    const file = await this.files.findOne({ where: { id: args.fileId }, relations: ["user", "workspace"] });
    if (!file || file.user?.id !== args.userId) throw new BadRequestException("File not found or not owned by user.");

    const wsId = file.workspace?.id ?? args.workspaceId ?? null;
    await this.workspaceAccess.assertWorkspacePermissionOrThrow({
      userId: args.userId,
      globalRole: args.globalRole,
      workspaceId: wsId,
      requiredPermissions: wsId ? ["workspace.files.read"] : [],
      route: "POST /v1/files/:fileId/multimodal/deep",
      method: "POST"
    });

    const extraction = this.extractions.create({
      user: { id: args.userId } as any,
      file: { id: file.id } as any,
      workspace: wsId ? ({ id: wsId } as any) : null,
      modality: this.modalityFromKind(file.fileKind),
      status: "queued",
      processorVersion: EXTRACTION_PIPELINE_VERSION,
      unifiedResult: {
        decision: {
          stage: "queued",
          extractionType: "deep_multimodal",
          privacyProfile: file.workspace?.id ? "workspace_scoped" : "personal_scoped"
        }
      }
    });
    await this.extractions.save(extraction);

    const job = this.aiJobs.create({
      user: { id: args.userId } as any,
      conversation: null as any,
      jobType: "multimodal_deep_extract",
      requestedMode: "deep",
      classifiedMode: "beast",
      status: "queued",
      progress: 0,
      shardKey: "multimodal_deep:high",
      queuePriority: 85,
      payload: {
        extractionId: extraction.id,
        fileId: file.id,
        modality: this.modalityFromKind(file.fileKind)
      }
    });
    await this.aiJobs.save(job);

    extraction.aiJob = job;
    await this.extractions.save(extraction);

    this.realtime.emitToUser(args.userId, "job:update", { aiJobId: job.id, status: job.status, progress: job.progress });
    this.realtime.emitToUser(args.userId, "multimodal:queued", { extractionId: extraction.id, aiJobId: job.id, fileId: file.id });

    return { aiJobId: job.id, extractionId: extraction.id };
  }

  async processQueuedJob(job: AiJobEntity): Promise<void> {
    const payload = job.payload ?? {};
    const extractionId = (payload as any).extractionId as string | undefined;
    const fileId = (payload as any).fileId as string | undefined;
    if (!extractionId || !fileId) {
      await this.aiJobs.update({ id: job.id }, { status: "failed", errorMessage: "Missing extractionId/fileId in payload" } as any);
      return;
    }

    const extraction = await this.extractions.findOne({ where: { id: extractionId }, relations: ["file", "user"] });
    if (!extraction) {
      await this.aiJobs.update({ id: job.id }, { status: "failed", errorMessage: "Extraction row missing" } as any);
      return;
    }

    const file = extraction.file as FileEntity;
    await this.extractions.update({ id: extraction.id }, { status: "processing" } as any);
    this.realtime.emitToUser((extraction.user as any).id, "multimodal:update", { extractionId: extraction.id, status: "processing" });

    try {
      const { resolvedPath } = await this.resolvePrivateStoragePath(file.storageUri);
      const st = await fs.stat(resolvedPath);
      const maxBytes = Number(this.cfg.get<string>("MALV_MULTIMODAL_MAX_INPUT_BYTES") ?? "52428800");
      if (st.size > maxBytes) {
        throw new BadRequestException(`File exceeds multimodal max input bytes (${maxBytes}).`);
      }
      const buf = await fs.readFile(resolvedPath);

      const kind = file.fileKind;
      const unified: Record<string, unknown> = {
        source: "extraction_pipeline",
        modality: kind,
        fileId: file.id,
        bytes: buf.length
      };
      let retrievalText = "";
      let sectionsJson: Record<string, unknown> | null = null;
      let pageMetaJson: Record<string, unknown> | null = null;
      let tablesFiguresJson: Record<string, unknown> | null = null;
      let segmentMetaJson: Record<string, unknown> | null = null;
      let imageAnalysisJson: Record<string, unknown> | null = null;

      if (kind === "pdf") {
        file.checksum = this.resolveFileChecksum(file, buf);
        await this.files.update({ id: file.id }, { checksum: file.checksum } as any);
        const pdfModule = (await import("pdf-parse")) as unknown as { default?: (b: Buffer) => Promise<{ text?: string; numpages?: number; info?: unknown }> };
        const pdfParse = pdfModule.default ?? (pdfModule as any);
        const parsed = await Promise.race([
          pdfParse(buf),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new BadRequestException("PDF parsing timed out.")), this.processTimeoutMs("MALV_PDF_PARSE_TIMEOUT_MS", 20_000))
          )
        ]);
        const text = (parsed.text ?? "").slice(0, 500_000);
        retrievalText = text;
        const numpages = (parsed as any).numpages ?? null;
        pageMetaJson = { pageCount: numpages, info: (parsed as any).info ?? null };
        const citationAnchors =
          typeof numpages === "number" && numpages > 0
            ? Array.from({ length: Math.min(numpages, 50) }, (_, i) => ({
                page: i + 1,
                citationId: `p${i + 1}`,
                confidence: "heuristic"
              }))
            : [];
        sectionsJson = {
          pages:
            typeof numpages === "number"
              ? Array.from({ length: Math.min(numpages, 500) }, (_, i) => ({ page: i + 1, textLength: Math.floor(text.length / Math.max(numpages, 1)) }))
              : [],
          citationAnchors
        };
        tablesFiguresJson = { note: "Heuristic table/figure anchors; refine with layout parser in worker tier." };
        unified.pdf = {
          pages: numpages,
          textPreview: text.slice(0, 4000),
          citationAnchorsCount: citationAnchors.length
        };
      } else if (kind === "image") {
        file.checksum = this.resolveFileChecksum(file, buf);
        await this.files.update({ id: file.id }, { checksum: file.checksum } as any);
        const imgSize = await loadImageSize();
        const dim = imgSize ? imgSize(buf) : {};
        imageAnalysisJson = {
          width: dim.width ?? null,
          height: dim.height ?? null,
          type: dim.type ?? file.mimeType ?? null,
          format: file.mimeType ?? null
        };
        retrievalText = `image:${file.originalName} ${dim.width ?? "?"}x${dim.height ?? "?"} ${file.mimeType ?? ""}`;
        unified.image = imageAnalysisJson;
      } else if (kind === "audio") {
        file.checksum = this.resolveFileChecksum(file, buf);
        await this.files.update({ id: file.id }, { checksum: file.checksum } as any);
        const probe = await this.probeMedia(resolvedPath);
        segmentMetaJson = {
          format: probe.format ?? null,
          durationSec: probe.durationSec ?? null,
          bitRate: probe.bitRate ?? null,
          tags: probe.tags ?? null
        };
        retrievalText = `audio:${file.originalName} duration=${probe.durationSec ?? "unknown"}s`;
        unified.audio = segmentMetaJson;
      } else if (kind === "video") {
        const fileChecksum = this.resolveFileChecksum(file, buf);
        file.checksum = fileChecksum;
        await this.files.update({ id: file.id }, { checksum: fileChecksum } as any);
        const namespaceKey = file.workspace?.id ? `ws_${file.workspace.id}` : `user_${(extraction.user as any).id}`;
        const probe = await this.probeMedia(resolvedPath);
        const timeline = this.buildVideoTimeline(probe.durationSec);
        const segmentIntelligence = await this.buildVideoSegmentIntelligence({
          namespaceKey,
          resolvedPath,
          fileChecksum,
          processorVersion: EXTRACTION_PIPELINE_VERSION,
          fileName: file.originalName,
          durationSec: probe.durationSec,
          timeline
        });
        segmentMetaJson = {
          format: probe.format ?? null,
          durationSec: probe.durationSec ?? null,
          bitRate: probe.bitRate ?? null,
          width: probe.width ?? null,
          height: probe.height ?? null,
          tags: probe.tags ?? null,
          timeline,
          segmentIntelligence
        };
        retrievalText = `video:${file.originalName} duration=${probe.durationSec ?? "unknown"}s segments=${timeline.length} reasonedSegments=${segmentIntelligence.length}`;
        unified.video = {
          ...(segmentMetaJson ?? {}),
          timelineSegments: timeline.length,
          intelligenceReady: segmentIntelligence.length > 0
        };
      } else {
        retrievalText = `document:${file.originalName} ${kind}`;
        unified.other = { note: "Baseline extraction; modality-specific worker can deepen." };
      }

      await this.extractions.update(
        { id: extraction.id },
        {
          status: "completed",
          retrievalText,
          unifiedResult: unified,
          sectionsJson: sectionsJson ?? undefined,
          pageMetaJson: pageMetaJson ?? undefined,
          tablesFiguresJson: tablesFiguresJson ?? undefined,
          segmentMetaJson: segmentMetaJson ?? undefined,
          imageAnalysisJson: imageAnalysisJson ?? undefined,
          processorVersion: EXTRACTION_PIPELINE_VERSION
        } as any
      );

      await this.aiJobs.update(
        { id: job.id },
        {
          status: "completed",
          progress: 100,
          finishedAt: new Date(),
          resultReply: "Multimodal extraction completed.",
          resultMeta: { extractionId: extraction.id, fileId: file.id }
        } as any
      );

      this.realtime.emitToUser((extraction.user as any).id, "job:update", { aiJobId: job.id, status: "completed", progress: 100 });
      this.realtime.emitToUser((extraction.user as any).id, "multimodal:completed", { extractionId: extraction.id, fileId: file.id });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      this.observability.incVideoFailure("deep_extract");
      this.logger.warn(
        JSON.stringify({
          tag: "multimodal.extraction.failed",
          aiJobId: job.id,
          extractionId: extraction.id,
          fileId: file.id,
          error: errMsg
        })
      );
      const uid = (job.user as any)?.id ?? (extraction.user as any)?.id;
      await this.extractions.update({ id: extraction.id }, { status: "failed", errorMessage: errMsg } as any);
      await this.aiJobs.update({ id: job.id }, { status: "failed", errorMessage: errMsg, finishedAt: new Date() } as any);
      if (uid) this.realtime.emitToUser(uid, "job:update", { aiJobId: job.id, status: "failed", progress: 100 });
    }
  }

  async getLatestExtractionForFile(args: { userId: string; globalRole: GlobalRole; fileId: string }): Promise<MultimodalExtractionEntity | null> {
    const rows = await this.extractions.find({
      where: { file: { id: args.fileId }, user: { id: args.userId } },
      relations: ["file", "workspace", "aiJob"],
      order: { createdAt: "DESC" },
      take: 1
    });
    const row = rows[0] ?? null;
    if (!row) return null;
    const wsId = row.workspace?.id ?? null;
    await this.workspaceAccess.assertWorkspacePermissionOrThrow({
      userId: args.userId,
      globalRole: args.globalRole,
      workspaceId: wsId,
      requiredPermissions: wsId ? ["workspace.files.read"] : [],
      route: "GET /v1/files/:fileId/multimodal/deep",
      method: "GET"
    });
    return row;
  }

  async createSimulatedExtraction(args: { userId: string; globalRole: GlobalRole; fileId: string; scenario?: string }) {
    if (!this.flags.devHarnessEnabled()) {
      throw new ForbiddenException(
        "Multimodal dev harness is disabled. Use POST /v1/files/:fileId/multimodal/deep with real stored bytes, or set MALV_DEV_HARNESS_ENABLED for optional fixtures."
      );
    }
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "multimodal_enqueue" });
    const file = await this.files.findOne({ where: { id: args.fileId }, relations: ["user", "workspace"] });
    if (!file || file.user?.id !== args.userId) throw new BadRequestException("File not found or not owned by user.");
    const wsId = file.workspace?.id ?? null;
    await this.workspaceAccess.assertWorkspacePermissionOrThrow({
      userId: args.userId,
      globalRole: args.globalRole,
      workspaceId: wsId,
      requiredPermissions: wsId ? ["workspace.files.read"] : [],
      route: "POST /v1/files/:fileId/multimodal/deep/dev-harness",
      method: "POST"
    });

    const modality = this.modalityFromKind(file.fileKind);
    const scenario = (args.scenario ?? "default").slice(0, 60);
    const job = this.aiJobs.create({
      user: { id: args.userId } as any,
      conversation: null as any,
      jobType: "multimodal_deep_extract",
      requestedMode: "simulate",
      classifiedMode: "extract",
      status: "completed",
      progress: 100,
      shardKey: "multimodal_deep:simulate",
      queuePriority: 40,
      payload: { fileId: file.id, modality, scenario, devHarnessFixture: true },
      resultReply: "Dev harness multimodal fixture completed (not production extraction).",
      resultMeta: { fileId: file.id, modality, scenario, devHarnessFixture: true },
      finishedAt: new Date()
    });
    await this.aiJobs.save(job);

    const unified = this.buildDevHarnessFixtureUnified(modality, scenario, file.originalName);
    const extraction = this.extractions.create({
      user: { id: args.userId } as any,
      file: { id: file.id } as any,
      workspace: wsId ? ({ id: wsId } as any) : null,
      aiJob: job,
      modality,
      status: "completed",
      unifiedResult: unified,
      retrievalText: JSON.stringify(unified).slice(0, 12000),
      sectionsJson:
        modality === "pdf"
          ? { citationAnchors: (unified as any).pdf?.citationAnchors ?? [], devHarnessFixture: true }
          : modality === "video"
            ? { scenes: (unified as any).video?.timeline ?? [], devHarnessFixture: true }
            : { devHarnessFixture: true },
      segmentMetaJson: modality === "video" ? { timeline: (unified as any).video?.timeline ?? [], devHarnessFixture: true } : undefined,
      imageAnalysisJson: modality === "image" ? (unified as any).image : undefined,
      processorVersion: "malv-multimodal-dev-harness-1"
    });
    await this.extractions.save(extraction);
    this.realtime.emitToUser(args.userId, "multimodal:completed", {
      extractionId: extraction.id,
      fileId: file.id,
      devHarnessFixture: true
    });
    return { extractionId: extraction.id, aiJobId: job.id, devHarnessFixture: true };
  }

  private async probeMedia(resolvedPath: string): Promise<{
    durationSec?: number | null;
    bitRate?: number | null;
    format?: string | null;
    width?: number | null;
    height?: number | null;
    tags?: Record<string, unknown> | null;
  }> {
    try {
      const out = await this.runProcessWithTimeout({
        command: "ffprobe",
        commandArgs: ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", resolvedPath],
        timeoutMs: this.processTimeoutMs("MALV_FFPROBE_TIMEOUT_MS", 20_000)
      });
      if (out.timedOut || out.code !== 0 || !out.stdout) return {};
      const j = JSON.parse(out.stdout) as any;
      const dur = j?.format?.duration ? Number(j.format.duration) : null;
      const bitRate = j?.format?.bit_rate ? Number(j.format.bit_rate) : null;
      const format = j?.format?.format_name ?? null;
      const vstream = (j?.streams ?? []).find((s: any) => s.codec_type === "video");
      const width = vstream?.width != null ? Number(vstream.width) : null;
      const height = vstream?.height != null ? Number(vstream.height) : null;
      const tags = (j?.format?.tags ?? {}) as Record<string, unknown>;
      return { durationSec: dur, bitRate, format, width, height, tags };
    } catch {
      return {};
    }
  }
}
