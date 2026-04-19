import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { randomUUID } from "crypto";
import { KillSwitchService } from "../kill-switch/kill-switch.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { MalvUserNotificationEntity } from "../db/entities/malv-user-notification.entity";
import { MalvPushProviderService } from "./malv-push-provider.service";
import { MalvPushTokenRegistryService } from "./malv-push-token-registry.service";
import type { MalvNotificationDeliveryAudit } from "./malv-device-platform.types";

export type MalvNotificationDeliveryTier = "websocket_live" | "persisted_inbox_only" | "no_live_route";

export type MalvNotificationDeliveryResult = {
  tier: MalvNotificationDeliveryTier;
  notificationId: string;
  websocketDelivered: boolean;
  nativePushAttempted: boolean;
  audit: MalvNotificationDeliveryAudit;
  detail: Record<string, unknown>;
};

@Injectable()
export class MalvNotificationDeliveryService {
  constructor(
    private readonly killSwitch: KillSwitchService,
    @Inject(forwardRef(() => RealtimeGateway)) private readonly realtime: RealtimeGateway,
    private readonly pushRegistry: MalvPushTokenRegistryService,
    private readonly pushProvider: MalvPushProviderService,
    @InjectRepository(MalvUserNotificationEntity)
    private readonly notifications: Repository<MalvUserNotificationEntity>
  ) {}

  /**
   * Priority: native push (not implemented in repo) → websocket → persisted inbox.
   * Always persists a row so unread/history is truthful across surfaces.
   */
  async deliver(args: {
    userId: string;
    kind: string;
    title: string;
    body?: string | null;
    taskId?: string | null;
    correlationId?: string | null;
    payload?: Record<string, unknown> | null;
    wsEventName?: string;
  }): Promise<MalvNotificationDeliveryResult> {
    const ks = await this.killSwitch.getState();
    if (!ks.systemOn) {
      const audit: MalvNotificationDeliveryAudit = {
        attemptedChannels: [],
        successfulChannels: [],
        failedChannels: []
      };
      const id = randomUUID();
      await this.notifications.save(
        this.notifications.create({
          id,
          user: { id: args.userId } as any,
          kind: args.kind,
          title: args.title,
          body: args.body ?? null,
          payloadJson: {
            ...(args.payload ?? {}),
            killSwitchBlocked: true
          },
          deliveryChannel: "blocked_kill_switch",
          deliveryDetailJson: { reason: "kill_switch" },
          taskId: args.taskId ?? null,
          correlationId: args.correlationId ?? null
        })
      );
      return {
        tier: "no_live_route",
        notificationId: id,
        websocketDelivered: false,
        nativePushAttempted: false,
        audit,
        detail: { reason: "kill_switch" }
      };
    }

    const audit: MalvNotificationDeliveryAudit = {
      attemptedChannels: [],
      successfulChannels: [],
      failedChannels: []
    };

    const pushTokens = this.pushRegistry.tokensForUser(args.userId);
    let pushSuccess = false;
    for (const tokenRecord of pushTokens) {
      const channel = tokenRecord.platform === "android" ? "push_android" : "push_ios";
      audit.attemptedChannels.push(channel);
      const sent = await this.pushProvider.sendNotification(tokenRecord, {
        title: args.title,
        body: args.body ?? null,
        data: args.payload ?? null
      });
      if (sent.ok) {
        pushSuccess = true;
        audit.successfulChannels.push(channel);
      } else {
        audit.failedChannels.push(channel);
      }
    }

    const wsCount = this.realtime.liveAuthenticatedSocketCountForUser(args.userId);
    const wsEvent = args.wsEventName ?? "malv:notification";

    const id = randomUUID();
    const tier: MalvNotificationDeliveryTier = wsCount > 0 ? "websocket_live" : "persisted_inbox_only";
    const deliveryChannel = pushSuccess
      ? "native_push_and_inbox"
      : tier === "websocket_live"
        ? "websocket_and_inbox"
        : "persisted_inbox";

    await this.notifications.save(
      this.notifications.create({
        id,
        user: { id: args.userId } as any,
        kind: args.kind,
        title: args.title,
        body: args.body ?? null,
        payloadJson: args.payload ?? null,
        deliveryChannel,
        deliveryDetailJson: {
          websocketSockets: wsCount,
          pushAttempted: pushTokens.length > 0,
          pushTokenCount: pushTokens.length,
          pushDelivered: pushSuccess,
          audit
        },
        taskId: args.taskId ?? null,
        correlationId: args.correlationId ?? null
      })
    );

    let websocketDelivered = false;
    if (wsCount > 0) {
      audit.attemptedChannels.push("websocket_live");
      this.realtime.emitToUser(args.userId, wsEvent, {
        notificationId: id,
        kind: args.kind,
        title: args.title,
        body: args.body ?? null,
        taskId: args.taskId ?? null,
        correlationId: args.correlationId ?? null,
        payload: args.payload ?? null,
        deliveryTier: tier
      });
      websocketDelivered = true;
      audit.successfulChannels.push("websocket_live");
    }
    audit.attemptedChannels.push("persisted_inbox");
    audit.successfulChannels.push("persisted_inbox");

    return {
      tier,
      notificationId: id,
      websocketDelivered,
      nativePushAttempted: pushTokens.length > 0,
      audit,
      detail: { deliveryChannel, websocketSockets: wsCount, pushDelivered: pushSuccess, pushTokenCount: pushTokens.length }
    };
  }

  async listUnread(userId: string, limit = 50): Promise<MalvUserNotificationEntity[]> {
    return this.notifications.find({
      where: { user: { id: userId }, readAt: IsNull() },
      order: { createdAt: "DESC" },
      take: Math.min(200, Math.max(1, limit))
    });
  }

  async markRead(userId: string, notificationId: string): Promise<boolean> {
    const res = await this.notifications.update(
      { id: notificationId, user: { id: userId } as any, readAt: IsNull() },
      { readAt: new Date() }
    );
    return (res.affected ?? 0) > 0;
  }
}
