import { SecurityRetentionService } from "./security-retention.service";

function cfg(values: Record<string, string | undefined>) {
  return { get: (k: string) => values[k] } as any;
}

function row(
  id: string,
  severity: "low" | "medium" | "high" | "critical",
  daysAgo: number
) {
  return {
    id,
    severity,
    occurredAt: new Date(Date.now() - daysAgo * 86_400_000),
    eventType: "e",
    subsystem: "s",
    summary: "x",
    detailsJson: null,
    actorRole: null,
    sourceIp: null,
    correlationId: null,
    actorUser: null
  };
}

describe("SecurityRetentionService", () => {
  it("deletes only batched eligible rows", async () => {
    const lowRow = row("a1", "low", 100);
    const find = jest
      .fn()
      .mockResolvedValueOnce([lowRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const del = jest.fn().mockResolvedValue(undefined);
    const repo = { find, delete: del } as any;
    const sink = {
      toNormalized: jest.fn(() => ({ occurredAt: "", occurred_at: "" })),
      archiveBatchBestEffort: jest.fn()
    };
    const svc = new SecurityRetentionService(repo, sink as any, cfg({ SECURITY_EVENT_RETENTION_DAYS: "90" }));
    const r = await svc.runRetentionBatch();
    expect(r.deletedTotal).toBe(1);
    expect(del).toHaveBeenCalledWith(["a1"]);
    expect(sink.archiveBatchBestEffort).not.toHaveBeenCalled();
  });

  it("preserves high severity longer than low tier window", async () => {
    const find = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const del = jest.fn();
    const repo = { find, delete: del } as any;
    const sink = { toNormalized: jest.fn(), archiveBatchBestEffort: jest.fn() };
    const svc = new SecurityRetentionService(
      repo,
      sink as any,
      cfg({
        SECURITY_EVENT_RETENTION_DAYS: "90",
        SECURITY_EVENT_HIGH_RETENTION_DAYS: "365"
      })
    );
    await svc.runRetentionBatch();
    expect(del).not.toHaveBeenCalled();
  });

  it("archives before delete when archival is enabled", async () => {
    const lowRow = row("x1", "low", 100);
    const find = jest
      .fn()
      .mockResolvedValueOnce([lowRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const del = jest.fn().mockResolvedValue(undefined);
    const archive = jest.fn().mockResolvedValue(true);
    const repo = { find, delete: del } as any;
    const sink = {
      toNormalized: jest.fn(() => ({ test: 1 })),
      archiveBatchBestEffort: archive
    };
    const svc = new SecurityRetentionService(
      repo,
      sink as any,
      cfg({
        SECURITY_EVENT_ARCHIVE_BEFORE_DELETE: "true",
        SECURITY_EVENT_RETENTION_DAYS: "90"
      })
    );
    await svc.runRetentionBatch();
    expect(archive).toHaveBeenCalled();
    expect(del).toHaveBeenCalledWith(["x1"]);
  });

  it("skips delete when archive dispatch fails", async () => {
    const lowRow = row("x1", "low", 100);
    const find = jest.fn().mockResolvedValueOnce([lowRow]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const del = jest.fn();
    const repo = { find, delete: del } as any;
    const sink = {
      toNormalized: jest.fn(() => ({})),
      archiveBatchBestEffort: jest.fn().mockResolvedValue(false)
    };
    const svc = new SecurityRetentionService(
      repo,
      sink as any,
      cfg({ SECURITY_EVENT_ARCHIVE_BEFORE_DELETE: "true" })
    );
    const r = await svc.runRetentionBatch();
    expect(r.stoppedEarly).toBe(true);
    expect(del).not.toHaveBeenCalled();
  });

  it("deletes old high severity only after high retention cutoff", async () => {
    const highOld = row("h1", "high", 400);
    const find = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([highOld]).mockResolvedValueOnce([]);
    const del = jest.fn().mockResolvedValue(undefined);
    const repo = { find, delete: del } as any;
    const sink = {
      toNormalized: jest.fn(() => ({ occurredAt: "", occurred_at: "" })),
      archiveBatchBestEffort: jest.fn()
    };
    const svc = new SecurityRetentionService(
      repo,
      sink as any,
      cfg({
        SECURITY_EVENT_RETENTION_DAYS: "90",
        SECURITY_EVENT_HIGH_RETENTION_DAYS: "365"
      })
    );
    await svc.runRetentionBatch();
    expect(del).toHaveBeenCalledWith(["h1"]);
  });
});
