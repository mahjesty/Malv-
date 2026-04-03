import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  WorkspaceRuntimeSessionEntity,
  type WorkspaceRuntimeSessionStatus,
  type WorkspaceRuntimeSourceType
} from "../db/entities/workspace-runtime-session.entity";
import { WorkspaceTaskEntity } from "../db/entities/workspace-task.entity";
import { WorkspaceApprovalItemEntity } from "../db/entities/workspace-approval-item.entity";
import { SandboxRunEntity, type SandboxRunStatus } from "../db/entities/sandbox-run.entity";
import { SandboxCommandRecordEntity } from "../db/entities/sandbox-command-record.entity";
import { SandboxPatchProposalEntity } from "../db/entities/sandbox-patch-proposal.entity";
import { MessageEntity } from "../db/entities/message.entity";
import { MalvStudioSessionEntity } from "../db/entities/malv-studio-session.entity";
import { WorkspaceProductivityService } from "./workspace-productivity.service";

type RuntimeHydrated = {
  session: WorkspaceRuntimeSessionEntity;
  tasks: WorkspaceTaskEntity[];
  runs: SandboxRunEntity[];
  logs: SandboxCommandRecordEntity[];
  patches: SandboxPatchProposalEntity[];
  approvals: WorkspaceApprovalItemEntity[];
  outputs: Array<{
    messageId: string;
    conversationId: string | null;
    preview: string;
    source: string | null;
    createdAt: string;
    metadata: Record<string, unknown> | null;
  }>;
};

@Injectable()
export class WorkspaceRuntimeSessionService {
  constructor(
    @InjectRepository(WorkspaceRuntimeSessionEntity)
    private readonly sessions: Repository<WorkspaceRuntimeSessionEntity>,
    @InjectRepository(WorkspaceTaskEntity)
    private readonly tasks: Repository<WorkspaceTaskEntity>,
    @InjectRepository(WorkspaceApprovalItemEntity)
    private readonly approvals: Repository<WorkspaceApprovalItemEntity>,
    @InjectRepository(SandboxRunEntity)
    private readonly runs: Repository<SandboxRunEntity>,
    @InjectRepository(SandboxCommandRecordEntity)
    private readonly logs: Repository<SandboxCommandRecordEntity>,
    @InjectRepository(SandboxPatchProposalEntity)
    private readonly patches: Repository<SandboxPatchProposalEntity>,
    @InjectRepository(MessageEntity)
    private readonly messages: Repository<MessageEntity>,
    @InjectRepository(MalvStudioSessionEntity)
    private readonly studioSessions: Repository<MalvStudioSessionEntity>,
    private readonly productivity: WorkspaceProductivityService
  ) {}

  async createSession(args: {
    userId: string;
    sourceType: WorkspaceRuntimeSourceType;
    sourceId: string;
    metadata?: Record<string, unknown> | null;
  }) {
    const sourceId = args.sourceId.trim();
    if (!sourceId) throw new BadRequestException("sourceId is required.");
    const existing = await this.sessions.findOne({
      where: { user: { id: args.userId }, sourceType: args.sourceType, sourceId }
    });
    if (existing) return existing;
    const row = this.sessions.create({
      user: { id: args.userId } as any,
      sourceType: args.sourceType,
      sourceId,
      status: "idle",
      metadata: args.metadata ?? null,
      lastEventAt: new Date()
    });
    return await this.sessions.save(row);
  }

  async listSessionsForUser(args: { userId: string; limit?: number }) {
    const take = Math.min(Math.max(args.limit ?? 40, 1), 100);
    return await this.sessions.find({
      where: { user: { id: args.userId } },
      order: { updatedAt: "DESC" },
      take
    });
  }

  async attachSandboxRun(args: { userId: string; sessionId: string; runId: string }) {
    const session = await this.sessions.findOne({ where: { id: args.sessionId, user: { id: args.userId } } });
    if (!session) throw new BadRequestException("Runtime session not found.");
    session.activeRunId = args.runId;
    session.lastEventAt = new Date();
    await this.sessions.save(session);
    return session;
  }

  async getSession(args: { userId: string; sessionId: string }): Promise<RuntimeHydrated> {
    const session = await this.sessions.findOne({ where: { id: args.sessionId, user: { id: args.userId } } });
    if (!session) throw new BadRequestException("Runtime session not found.");
    await this.productivity.syncSandboxApprovals(args.userId);

    const tasksWhere: any[] = [{ user: { id: args.userId } }];
    const approvalsWhere: any[] = [{ user: { id: args.userId } }];
    let conversationIdForOutputs: string | null = null;
    let runIds: string[] = [];

    if (session.sourceType === "chat") {
      tasksWhere.push({ user: { id: args.userId }, conversationId: session.sourceId });
      approvalsWhere.push({ user: { id: args.userId }, conversationId: session.sourceId });
      conversationIdForOutputs = session.sourceId;
    } else if (session.sourceType === "studio") {
      const studio = await this.studioSessions.findOne({ where: { id: session.sourceId, user: { id: args.userId } } });
      if (studio?.lastSandboxRunId) runIds.push(studio.lastSandboxRunId);
      if (studio?.lastSandboxRunId && session.activeRunId !== studio.lastSandboxRunId) {
        session.activeRunId = studio.lastSandboxRunId;
      }
    } else {
      const task = await this.tasks.findOne({ where: { id: session.sourceId, user: { id: args.userId } } });
      if (task?.conversationId) {
        tasksWhere.push({ user: { id: args.userId }, conversationId: task.conversationId });
        approvalsWhere.push({ user: { id: args.userId }, conversationId: task.conversationId });
        conversationIdForOutputs = task.conversationId;
      }
      tasksWhere.push({ user: { id: args.userId }, id: session.sourceId });
    }

    if (session.activeRunId) runIds.push(session.activeRunId);
    runIds = Array.from(new Set(runIds.filter(Boolean)));

    const [tasks, approvals, runs, outputs] = await Promise.all([
      this.tasks.find({
        where: tasksWhere,
        order: { updatedAt: "DESC" },
        take: 40
      }),
      this.approvals.find({
        where: approvalsWhere,
        order: { updatedAt: "DESC" },
        take: 30
      }),
      runIds.length
        ? this.runs.find({
            where: runIds.map((id) => ({ id, user: { id: args.userId } })),
            order: { updatedAt: "DESC" }
          })
        : this.runs.find({
            where: { user: { id: args.userId } },
            order: { updatedAt: "DESC" },
            take: 10
          }),
      conversationIdForOutputs
        ? this.messages.find({
            where: {
              user: { id: args.userId },
              role: "assistant",
              status: "done",
              conversation: { id: conversationIdForOutputs }
            },
            relations: ["conversation"],
            order: { createdAt: "DESC" },
            take: 20
          })
        : this.messages.find({
            where: { user: { id: args.userId }, role: "assistant", status: "done" },
            relations: ["conversation"],
            order: { createdAt: "DESC" },
            take: 12
          })
    ]);

    const runIdSet = new Set(runs.map((r) => r.id));
    const [logs, patches] = await Promise.all([
      runIdSet.size
        ? this.logs.find({
            where: Array.from(runIdSet).map((id) => ({ sandboxRun: { id }, user: { id: args.userId } })),
            order: { createdAt: "DESC" },
            take: 120
          })
        : Promise.resolve([]),
      runIdSet.size
        ? this.patches.find({
            where: Array.from(runIdSet).map((id) => ({ sandboxRun: { id }, user: { id: args.userId } })),
            order: { createdAt: "DESC" },
            take: 30
          })
        : Promise.resolve([])
    ]);

    const nextStatus = this.deriveRuntimeStatus({
      activeRunId: session.activeRunId ?? null,
      runById: new Map(runs.map((r) => [r.id, r.status])),
      approvals
    });
    if (session.status !== nextStatus) {
      session.status = nextStatus;
    }
    session.lastEventAt = new Date();
    await this.sessions.save(session);

    return {
      session,
      tasks,
      runs,
      logs,
      patches,
      approvals,
      outputs: outputs
        .filter((m) => !((m.metadata as any)?.malvPlaceholder))
        .map((m) => ({
          messageId: m.id,
          conversationId: (m.conversation as any)?.id ?? null,
          preview: (m.content ?? "").slice(0, 200),
          source: m.source ?? null,
          createdAt: m.createdAt.toISOString(),
          metadata: m.metadata ?? null
        }))
    };
  }

  private deriveRuntimeStatus(args: {
    activeRunId: string | null;
    runById: Map<string, SandboxRunStatus>;
    approvals: WorkspaceApprovalItemEntity[];
  }): WorkspaceRuntimeSessionStatus {
    const hasPendingApproval = args.approvals.some((a) => a.status === "pending");
    if (hasPendingApproval) return "waiting_approval";
    if (!args.activeRunId) return "idle";
    const runStatus = args.runById.get(args.activeRunId);
    if (!runStatus) return "idle";
    if (runStatus === "failed" || runStatus === "blocked" || runStatus === "cancelled" || runStatus === "validation_failed") {
      return "failed";
    }
    if (runStatus === "completed") return "completed";
    return "running";
  }
}

