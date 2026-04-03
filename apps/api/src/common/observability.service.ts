import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { collectDefaultMetrics, Counter, Histogram, Registry } from "prom-client";

@Injectable()
export class ObservabilityService {
  private readonly logger = new Logger(ObservabilityService.name);
  private readonly registry = new Registry();

  private readonly rateLimitEvents = new Counter({
    name: "malv_rate_limit_events_total",
    help: "Rate limit events by route/backend/outcome.",
    labelNames: ["route", "backend", "outcome"] as const,
    registers: [this.registry]
  });
  private readonly authFailures = new Counter({
    name: "malv_auth_failures_total",
    help: "Authentication failures by reason/channel.",
    labelNames: ["reason", "channel"] as const,
    registers: [this.registry]
  });
  private readonly websocketDisconnects = new Counter({
    name: "malv_websocket_disconnects_total",
    help: "Websocket disconnects grouped by reason.",
    labelNames: ["reason"] as const,
    registers: [this.registry]
  });
  private readonly uploadRegisterPath = new Counter({
    name: "malv_upload_register_path_total",
    help: "File registration path usage by mode.",
    labelNames: ["mode"] as const,
    registers: [this.registry]
  });
  private readonly vaultMigrations = new Counter({
    name: "malv_vault_plaintext_migrations_total",
    help: "Count of vault plaintext entries lazily migrated.",
    labelNames: ["trigger"] as const,
    registers: [this.registry]
  });
  private readonly recapFailures = new Counter({
    name: "malv_recap_failures_total",
    help: "Recap generation failures by phase.",
    labelNames: ["phase"] as const,
    registers: [this.registry]
  });
  private readonly videoFailures = new Counter({
    name: "malv_video_processing_failures_total",
    help: "Video processing failures by stage.",
    labelNames: ["stage"] as const,
    registers: [this.registry]
  });
  private readonly legacyUsage = new Counter({
    name: "malv_legacy_path_usage_total",
    help: "Legacy compatibility path usage by path name.",
    labelNames: ["path"] as const,
    registers: [this.registry]
  });
  private readonly httpDurationMs = new Histogram({
    name: "malv_http_request_duration_ms",
    help: "HTTP request duration in milliseconds (Express layer).",
    labelNames: ["method", "route_group", "status_class"] as const,
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 15_000, 60_000],
    registers: [this.registry]
  });
  private readonly jobExecutions = new Counter({
    name: "malv_job_executions_total",
    help: "Background AI job outcomes by type.",
    labelNames: ["job_type", "outcome"] as const,
    registers: [this.registry]
  });
  private readonly sandboxRunDurationMs = new Histogram({
    name: "malv_sandbox_run_duration_ms",
    help: "Sandbox execution duration after claim until terminal status.",
    labelNames: ["run_type", "outcome"] as const,
    buckets: [50, 100, 250, 500, 1000, 2500, 5000, 15_000, 60_000, 300_000],
    registers: [this.registry]
  });

  constructor(private readonly cfg: ConfigService) {
    const enableDefault = (this.cfg.get<string>("MALV_METRICS_ENABLE_DEFAULTS") ?? "true").toLowerCase() !== "false";
    if (enableDefault) {
      collectDefaultMetrics({ register: this.registry, prefix: "malv_node_" });
    }
  }

  private safeLabel(value: string, fallback = "unknown"): string {
    const v = (value ?? "").trim().toLowerCase();
    if (!v) return fallback;
    return v.replace(/[^a-z0-9_:.+-]/g, "_").slice(0, 96) || fallback;
  }

  incRateLimit(args: { routeKey: string; backend: "redis" | "memory"; outcome: "hit" | "blocked" | "fallback" }) {
    this.rateLimitEvents.inc({
      route: this.safeLabel(args.routeKey),
      backend: this.safeLabel(args.backend),
      outcome: this.safeLabel(args.outcome)
    });
  }

  incAuthFailure(args: { reason: string; channel: "jwt_guard" | "refresh" | "login" | "ws" }) {
    this.authFailures.inc({ reason: this.safeLabel(args.reason), channel: this.safeLabel(args.channel) });
  }

  incWebsocketDisconnect(reason: string) {
    this.websocketDisconnects.inc({ reason: this.safeLabel(reason, "client_or_transport") });
  }

  incUploadRegisterPath(mode: "upload_handle" | "legacy_storage_uri") {
    this.uploadRegisterPath.inc({ mode: this.safeLabel(mode) });
  }

  incVaultMigration(trigger: "lazy_read") {
    this.vaultMigrations.inc({ trigger: this.safeLabel(trigger) });
  }

  incRecapFailure(phase: "model_infer" | "pipeline") {
    this.recapFailures.inc({ phase: this.safeLabel(phase) });
  }

  incVideoFailure(stage: "vision_infer" | "deep_extract") {
    this.videoFailures.inc({ stage: this.safeLabel(stage) });
  }

  incLegacyPathUsage(pathName: "refresh_body_fallback" | "file_register_storage_uri") {
    this.legacyUsage.inc({ path: this.safeLabel(pathName) });
  }

  observeHttpRequest(args: { method: string; path: string; statusCode: number; durationMs: number }) {
    const method = this.safeLabel(args.method.toUpperCase(), "GET");
    const group = this.routeGroup(args.path);
    const sc = args.statusCode;
    const statusClass = sc >= 500 ? "5xx" : sc >= 400 ? "4xx" : sc >= 300 ? "3xx" : "2xx";
    this.httpDurationMs.observe({ method, route_group: group, status_class: statusClass }, Math.min(args.durationMs, 120_000));
  }

  private routeGroup(path: string): string {
    const p = (path ?? "/").split("?")[0] || "/";
    const parts = p.split("/").filter(Boolean);
    if (parts.length === 0) return "/";
    if (parts[0] === "v1" && parts.length >= 2) return `/v1/${parts[1]}`;
    return `/${parts[0]}`;
  }

  recordJobExecution(jobType: string, outcome: "completed" | "failed" | "retry_scheduled" | "requeued") {
    this.jobExecutions.inc({
      job_type: this.safeLabel(jobType, "unknown"),
      outcome: this.safeLabel(outcome)
    });
  }

  observeSandboxRun(runType: string, outcome: string, durationMs: number) {
    this.sandboxRunDurationMs.observe(
      { run_type: this.safeLabel(runType, "unknown"), outcome: this.safeLabel(outcome, "unknown") },
      Math.min(durationMs, 600_000)
    );
  }

  async renderPrometheus(): Promise<string> {
    return this.registry.metrics();
  }

  async metricsContentType(): Promise<string> {
    return this.registry.contentType;
  }

  logMonitoringHints(): void {
    this.logger.log(
      JSON.stringify({
        tag: "monitoring.hints",
        criticalSignals: [
          "auth_failures_spike",
          "rate_limit_spike",
          "ws_disconnect_anomaly",
          "video_processing_failures_spike",
          "malv_http_request_duration_ms_p99",
          "malv_job_executions_total_failed",
          "malv_sandbox_run_duration_ms_high"
        ]
      })
    );
  }
}
