import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomUUID } from "crypto";
import { KillSwitchService } from "../kill-switch/kill-switch.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import type { WorkspaceTaskEntity } from "../db/entities/workspace-task.entity";
import {
  MalvExternalActionDispatchEntity,
  type MalvExternalDispatchStatus
} from "../db/entities/malv-external-action-dispatch.entity";
import type { MalvBridgeCapabilityReport, MalvBridgeKind } from "./malv-bridge-capability.types";
import type { MalvExternalActionEnvelopeV1, MalvExternalActionKind } from "./malv-external-action.types";
import { malvAgentWireActionType, malvProtocolMetaForDispatch, type MalvAgentDispatchPayloadV1 } from "./malv-agent-protocol.types";
import { malvPickBridgeForAction } from "./malv-external-action-support.matrix";

const WS_EVENT = "malv:external_action_dispatch";

type TerminalDispatchStatus = "completed" | "rejected" | "failed";

function mergeResultJson(
  prev: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>
): Record<string, unknown> {
  return { ...(typeof prev === "object" && prev ? prev : {}), ...patch };
}

@Injectable()
export class MalvExternalActionDispatchService {
  constructor(
    private readonly killSwitch: KillSwitchService,
    @Inject(forwardRef(() => RealtimeGateway)) private readonly realtime: RealtimeGateway,
    @InjectRepository(MalvExternalActionDispatchEntity)
    private readonly dispatches: Repository<MalvExternalActionDispatchEntity>
  ) {}

  buildRequestKey(task: WorkspaceTaskEntity): string {
    const sched = task.scheduledFor?.toISOString() ?? "adhoc";
    return `${task.id}:${sched}`;
  }

  parseEnvelope(metadata: Record<string, unknown> | null | undefined): MalvExternalActionEnvelopeV1 | null {
    if (!metadata || typeof metadata !== "object") return null;
    const raw = metadata.malvExternalActionV1;
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    if (o.schemaVersion !== 1) return null;
    const kind = o.kind as MalvExternalActionKind | undefined;
    if (!kind) return null;
    const params = o.params;
    if (!params || typeof params !== "object") return null;
    return {
      schemaVersion: 1,
      kind,
      preferredBridge: (o.preferredBridge as MalvBridgeKind | null | undefined) ?? null,
      params: params as Record<string, unknown>
    };
  }

  pickBridge(kind: MalvExternalActionKind, report: MalvBridgeCapabilityReport, preferred?: MalvBridgeKind | null): MalvBridgeKind | null {
    const live = new Set(report.liveBridgeKinds);
    return malvPickBridgeForAction(kind, live, preferred ?? null);
  }

  private buildWirePayload(args: {
    dispatchId: string;
    correlationId: string;
    taskId: string;
    userId: string;
    bridge: MalvBridgeKind;
    envelope: MalvExternalActionEnvelopeV1;
    task: WorkspaceTaskEntity;
    at: Date;
    createdAt: Date;
    replay?: boolean;
  }): MalvAgentDispatchPayloadV1 {
    const meta = args.task.metadata as Record<string, unknown> | undefined;
    const target =
      meta && typeof meta.malvExternalTargetDeviceId === "string" && meta.malvExternalTargetDeviceId.trim()
        ? meta.malvExternalTargetDeviceId.trim()
        : null;
    return {
      schemaVersion: 1,
      protocolVersion: 1,
      dispatchId: args.dispatchId,
      correlationId: args.correlationId,
      taskId: args.taskId,
      userId: args.userId,
      bridge: args.bridge,
      actionType: malvAgentWireActionType(args.envelope.kind),
      actionPayload: args.envelope.params,
      riskLevel: args.task.riskLevel,
      requiresApproval: Boolean(args.task.requiresApproval),
      createdAt: args.createdAt.toISOString(),
      targetDeviceId: target,
      envelope: args.envelope,
      at: args.at.toISOString(),
      replay: args.replay,
      protocolMeta: malvProtocolMetaForDispatch({
        userId: args.userId,
        deviceId: target,
        bridge: args.bridge
      })
    };
  }

  /**
   * Creates dispatch row + emits WS envelope. Caller updates task to waiting_input + lease.
   * Idempotent on (taskId, requestKey).
   */
  async beginDispatch(args: {
    userId: string;
    task: WorkspaceTaskEntity;
    now: Date;
    cap: MalvBridgeCapabilityReport;
    requestKey: string;
  }): Promise<
    | { ok: true; dispatchId: string; correlationId: string; bridge: MalvBridgeKind }
    | { ok: false; code: string; detail: string }
  > {
    const ks = await this.killSwitch.getState();
    if (!ks.systemOn) {
      return { ok: false, code: "kill_switch", detail: "External execution blocked by kill switch." };
    }

    const envelope = this.parseEnvelope(args.task.metadata ?? undefined);
    if (!envelope) {
      return {
        ok: false,
        code: "malformed_external_action",
        detail: "Task is missing metadata.malvExternalActionV1 (schemaVersion 1)."
      };
    }

    if (envelope.kind === "open_app") {
      return { ok: false, code: "unsupported_action", detail: "open_app is not supported in v1 (no proven native launch path)." };
    }

    if (envelope.kind === "create_local_reminder") {
      return {
        ok: false,
        code: "unsupported_action",
        detail: "create_local_reminder is not supported in v1 (no truthful cross-platform OS reminder executor)."
      };
    }

    if (args.task.riskLevel === "high" || args.task.riskLevel === "critical") {
      const approved = Boolean((args.task.metadata as any)?.malvExternalRiskApproved);
      if (!approved) {
        return {
          ok: false,
          code: "high_risk_blocked",
          detail: "High/critical risk external actions require metadata.malvExternalRiskApproved."
        };
      }
    }

    const bridge = this.pickBridge(envelope.kind, args.cap, envelope.preferredBridge ?? null);
    if (!bridge) {
      return {
        ok: false,
        code: "capability_unavailable",
        detail: "No live executor bridge is available for this action."
      };
    }

    const meta = args.task.metadata as Record<string, unknown> | undefined;
    const targetDeviceId =
      meta && typeof meta.malvExternalTargetDeviceId === "string" && meta.malvExternalTargetDeviceId.trim()
        ? meta.malvExternalTargetDeviceId.trim()
        : null;

    const existing = await this.dispatches.findOne({ where: { taskId: args.task.id, requestKey: args.requestKey } });
    if (existing && (existing.status === "awaiting_client_ack" || existing.status === "pending_ws")) {
      const env = existing.actionPayloadJson as StoredDispatchPayload | null;
      const replayBridge = env?.bridge ?? bridge;
      const replayEnvelope = env?.envelope ?? envelope;
      const replayTargetDeviceId = env?.targetDeviceId ?? targetDeviceId;
      if (this.realtime.countExecutorDispatchTargets(args.userId, replayBridge, replayTargetDeviceId) === 0) {
        return {
          ok: false,
          code: "executor_route_unavailable",
          detail: replayTargetDeviceId
            ? `No live executor socket for bridge ${replayBridge} and device ${replayTargetDeviceId}.`
            : `No live executor sockets joined for bridge ${replayBridge}.`
        };
      }
      const wire = this.buildWirePayload({
        dispatchId: existing.id,
        correlationId: existing.correlationId,
        taskId: args.task.id,
        userId: args.userId,
        bridge: replayBridge,
        envelope: replayEnvelope,
        task: args.task,
        at: args.now,
        createdAt: existing.createdAt,
        replay: true
      });
      this.realtime.emitExternalActionDispatch(args.userId, replayBridge, replayTargetDeviceId, WS_EVENT, wire);
      return {
        ok: true,
        dispatchId: existing.id,
        correlationId: existing.correlationId,
        bridge: replayBridge
      };
    }
    if (existing && ["accepted", "completed"].includes(existing.status)) {
      return { ok: false, code: "duplicate_dispatch", detail: "This execution tick was already accepted for the same request key." };
    }

    if (this.realtime.countExecutorDispatchTargets(args.userId, bridge, targetDeviceId) === 0) {
      return {
        ok: false,
        code: "executor_route_unavailable",
        detail: targetDeviceId
          ? `No live executor socket for bridge ${bridge} and device ${targetDeviceId}.`
          : `No live executor sockets joined for bridge ${bridge}.`
      };
    }

    const correlationId = randomUUID();
    const id = randomUUID();
    const status: MalvExternalDispatchStatus = "awaiting_client_ack";

    const row = this.dispatches.create({
      id,
      user: { id: args.userId } as any,
      taskId: args.task.id,
      requestKey: args.requestKey,
      correlationId,
      actionKind: envelope.kind,
      actionPayloadJson: { envelope, bridge, targetDeviceId } satisfies StoredDispatchPayload,
      status
    });
    await this.dispatches.save(row);
    const createdAt = row.createdAt ?? args.now;

    const wire = this.buildWirePayload({
      dispatchId: id,
      correlationId,
      taskId: args.task.id,
      userId: args.userId,
      bridge,
      envelope,
      task: args.task,
      at: args.now,
      createdAt,
      replay: false
    });
    this.realtime.emitExternalActionDispatch(args.userId, bridge, targetDeviceId, WS_EVENT, wire);

    return { ok: true, dispatchId: id, correlationId, bridge };
  }

  /**
   * Marks an in-flight dispatch as failed when the task lease expires (audit trail).
   */
  async markTimedOut(dispatchId: string, atIso: string): Promise<void> {
    const row = await this.dispatches.findOne({ where: { id: dispatchId } });
    if (!row) return;
    if (!["awaiting_client_ack", "pending_ws", "accepted"].includes(row.status)) return;
    await this.dispatches.update(
      { id: dispatchId },
      {
        status: "failed",
        resultJson: mergeResultJson(row.resultJson as Record<string, unknown> | undefined, {
          reason: "executor_ack_timeout",
          detail: "No valid executor acknowledgement before lease expiry.",
          at: atIso
        }) as any
      }
    );
  }

  /**
   * Applies client/agent acknowledgement. Supports two-phase (accepted → terminal) and legacy single-hop terminal from `awaiting_client_ack`.
   * Terminal acks are idempotent when the row is already in a terminal state.
   */
  async applyClientAck(args: {
    userId: string;
    dispatchId: string;
    status: "accepted" | TerminalDispatchStatus;
    reason?: string | null;
    detail?: string | null;
    result?: Record<string, unknown> | null;
    executedAt?: string | null;
    deviceId?: string | null;
  }): Promise<
    | { ok: true; row: MalvExternalActionDispatchEntity; duplicate: boolean }
    | { ok: false; code: "not_found" | "invalid_transition" | "wrong_executor_device" }
  > {
    const row = await this.dispatches.findOne({ where: { id: args.dispatchId, user: { id: args.userId } } });
    if (!row) return { ok: false, code: "not_found" };

    const terminalRows: MalvExternalDispatchStatus[] = ["completed", "rejected", "failed", "superseded"];
    if (terminalRows.includes(row.status)) {
      return { ok: true, row, duplicate: true };
    }
    const stored = row.actionPayloadJson as StoredDispatchPayload | null;
    const requiredTargetDeviceId =
      typeof stored?.targetDeviceId === "string" && stored.targetDeviceId.trim() ? stored.targetDeviceId.trim() : null;
    if (requiredTargetDeviceId) {
      const ackDeviceId = typeof args.deviceId === "string" && args.deviceId.trim() ? args.deviceId.trim() : null;
      if (!ackDeviceId || ackDeviceId !== requiredTargetDeviceId) {
        return { ok: false, code: "wrong_executor_device" };
      }
    }

    const at = new Date().toISOString();
    const ackPatch: Record<string, unknown> = {
      lastAckStatus: args.status,
      lastAckAt: at,
      ...(args.reason != null && args.reason !== "" ? { reason: args.reason } : {}),
      ...(args.detail != null && args.detail !== "" ? { detail: args.detail } : {}),
      ...(args.result && Object.keys(args.result).length ? { agentResult: args.result } : {}),
      ...(args.executedAt ? { executedAt: args.executedAt } : {}),
      ...(args.deviceId ? { deviceId: args.deviceId } : {})
    };

    if (args.status === "accepted") {
      if (row.status !== "awaiting_client_ack" && row.status !== "pending_ws") {
        if (row.status === "accepted") {
          return { ok: true, row, duplicate: true };
        }
        return { ok: false, code: "invalid_transition" };
      }
      const next: MalvExternalDispatchStatus = "accepted";
      await this.dispatches.update(
        { id: row.id },
        {
          status: next,
          resultJson: mergeResultJson(row.resultJson as Record<string, unknown> | undefined, ackPatch) as any
        }
      );
      const fresh = await this.dispatches.findOne({ where: { id: row.id } });
      return { ok: true, row: fresh ?? row, duplicate: false };
    }

    const next: MalvExternalDispatchStatus =
      args.status === "completed" ? "completed" : args.status === "rejected" ? "rejected" : "failed";

    if (row.status !== "awaiting_client_ack" && row.status !== "pending_ws" && row.status !== "accepted") {
      return { ok: false, code: "invalid_transition" };
    }

    await this.dispatches.update(
      { id: row.id },
      {
        status: next,
        resultJson: mergeResultJson(row.resultJson as Record<string, unknown> | undefined, ackPatch) as any
      }
    );
    const fresh = await this.dispatches.findOne({ where: { id: row.id } });
    return { ok: true, row: fresh ?? row, duplicate: false };
  }

  async findForTask(taskId: string): Promise<MalvExternalActionDispatchEntity | null> {
    return this.dispatches.findOne({ where: { taskId }, order: { createdAt: "DESC" } });
  }
}

type StoredDispatchPayload = {
  envelope?: MalvExternalActionEnvelopeV1;
  bridge?: MalvBridgeKind;
  targetDeviceId?: string | null;
};
