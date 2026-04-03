import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { SecurityEventSinkService } from "./security-event-sink.service";

function cfg(values: Record<string, string | undefined>) {
  return { get: (k: string) => values[k] } as any;
}

describe("SecurityEventSinkService SIEM path under failure", () => {
  it("does not throw when NDJSON append fails; records degraded health", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "malv-siem-fail-"));
    const filePath = path.join(dir, "siem.ndjson");
    await fs.writeFile(filePath, "", "utf8");
    await fs.chmod(filePath, 0o444);

    const svc = new SecurityEventSinkService(
      cfg({
        MALV_SIEM_NDJSON_PATH: filePath
      })
    );

    const ev = svc.toNormalized({
      eventType: "test.siem",
      severity: "low",
      subsystem: "test",
      summary: "siem failure probe"
    });

    await expect(svc.dispatchBestEffort(ev)).resolves.toBeUndefined();

    const siem = svc.getSinkHealth().find((h) => h.sinkName === "siem_ndjson_file");
    expect(siem?.enabled).toBe(true);
    expect(siem?.lastError).toBeTruthy();

    await fs.chmod(filePath, 0o644).catch(() => undefined);
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  });
});
