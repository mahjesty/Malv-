import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

/**
 * MySQL advisory lock–based leader election for cron-style work across API replicas.
 * Uses GET_LOCK / RELEASE_LOCK (connection-scoped; hold briefly per tick).
 */
@Injectable()
export class ClusterLeaderService {
  private readonly logger = new Logger(ClusterLeaderService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService
  ) {}

  private lockKey(): string {
    const raw = (this.config.get<string>("MALV_CLUSTER_LEADER_LOCK_NAME") ?? "malv_cron_leader").trim();
    return raw.slice(0, 64) || "malv_cron_leader";
  }

  /**
   * Runs fn only if this node acquires the cluster lock (non-blocking wait up to lockWaitSeconds).
   */
  async runIfLeader<T>(fn: () => Promise<T>, lockWaitSeconds = 1): Promise<T | undefined> {
    const name = this.lockKey();
    const qr = this.dataSource.createQueryRunner();
    try {
      await qr.connect();
      const rows = await qr.query("SELECT GET_LOCK(?, ?) AS acquired", [name, lockWaitSeconds]);
      const acquired = rows?.[0]?.acquired;
      if (acquired !== 1) {
        return undefined;
      }
      try {
        return await fn();
      } finally {
        await qr.query("SELECT RELEASE_LOCK(?) AS released", [name]);
      }
    } catch (e) {
      this.logger.warn(`Leader lock error: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    } finally {
      await qr.release();
    }
  }
}
