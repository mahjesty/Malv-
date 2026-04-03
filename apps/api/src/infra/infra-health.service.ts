import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { MoreThanOrEqual, Repository } from "typeorm";
import { AiJobEntity } from "../db/entities/ai-job.entity";
import { AiJobLeaseEntity } from "../db/entities/ai-job-lease.entity";
import { SandboxRunEntity } from "../db/entities/sandbox-run.entity";

export type InfraHealthSnapshot = {
  aiJobs: {
    queued: number;
    running: number;
    failedLast24h: number;
    waitingRetry: number;
  };
  leases: { active: number };
  sandbox: { staged: number; executing: number; failedLast24h: number };
  alertingHints: string[];
};

/**
 * Aggregates queue / lease / sandbox signals for admin dashboards and monitors.
 */
@Injectable()
export class InfraHealthService {
  constructor(
    @InjectRepository(AiJobEntity) private readonly jobs: Repository<AiJobEntity>,
    @InjectRepository(AiJobLeaseEntity) private readonly leases: Repository<AiJobLeaseEntity>,
    @InjectRepository(SandboxRunEntity) private readonly runs: Repository<SandboxRunEntity>
  ) {}

  async snapshot(): Promise<InfraHealthSnapshot> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const now = new Date();

    const [queued, running, failedLast24h, waitingRetry, activeLeases, staged, executing, sbFailed] = await Promise.all([
      this.jobs.count({ where: { status: "queued" as const } as any }),
      this.jobs.count({ where: { status: "running" as const } as any }),
      this.jobs.count({
        where: { status: "failed" as const, updatedAt: MoreThanOrEqual(since) } as any
      }),
      this.jobs
        .createQueryBuilder("j")
        .where("j.status = :q", { q: "queued" })
        .andWhere("j.next_retry_after IS NOT NULL")
        .andWhere("j.next_retry_after > :now", { now })
        .getCount(),
      this.leases.createQueryBuilder("l").where("l.lease_expires_at > :now", { now }).getCount(),
      this.runs.count({ where: { status: "staged" as const } as any }),
      this.runs.count({ where: { status: "executing" as const } as any }),
      this.runs.count({
        where: { status: "failed" as const, updatedAt: MoreThanOrEqual(since) } as any
      })
    ]);

    const hints: string[] = [];
    if (queued > 200) hints.push("ai_job_queue_depth_high");
    if (activeLeases > 500) hints.push("ai_job_lease_table_large");
    if (staged > 50) hints.push("sandbox_staged_backlog");
    if (failedLast24h > 100) hints.push("ai_job_failures_spike_24h");

    return {
      aiJobs: { queued, running, failedLast24h, waitingRetry },
      leases: { active: activeLeases },
      sandbox: { staged, executing, failedLast24h: sbFailed },
      alertingHints: hints
    };
  }
}
