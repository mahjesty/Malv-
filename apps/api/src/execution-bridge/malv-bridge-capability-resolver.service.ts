import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { SmartHomeService } from "../smart-home/smart-home.service";
import { MalvExecutorEnrollmentService } from "./malv-executor-enrollment.service";
import { MalvPushTokenRegistryService } from "./malv-push-token-registry.service";
import type { MalvBridgeCapabilityReport, MalvBridgeEndpointState, MalvBridgeKind } from "./malv-bridge-capability.types";
import { malvSupportedActionsForPlatform } from "./malv-external-action-support.matrix";

@Injectable()
export class MalvBridgeCapabilityResolverService {
  constructor(
    private readonly cfg: ConfigService,
    @Inject(forwardRef(() => RealtimeGateway)) private readonly realtime: RealtimeGateway,
    private readonly smartHome: SmartHomeService,
    private readonly enrollment: MalvExecutorEnrollmentService,
    private readonly pushRegistry: MalvPushTokenRegistryService
  ) {}

  private staleMs(): number {
    return Math.max(30_000, Number(this.cfg.get<string>("MALV_EXECUTOR_HEARTBEAT_STALE_MS") ?? "120000"));
  }

  /**
   * Truthful capability map:
   * - browser_agent: at least one authenticated, connected websocket for the user.
   * - desktop_agent / mobile_agent: enrollment row + fresh heartbeat (explicit client registration).
   * - home_assistant_bridge: smart-home service reports reachable (real connector), not merely configured.
   */
  async resolveForUser(userId: string, now = new Date()): Promise<MalvBridgeCapabilityReport> {
    const resolvedAt = now.toISOString();
    const threshold = this.staleMs();
    const endpoints: MalvBridgeEndpointState[] = [];
    const executionCaveats: Partial<Record<MalvBridgeKind, string>> = {};

    const mobileMode = (this.cfg.get<string>("MALV_MOBILE_AGENT_EXECUTION_MODE") ?? "simulation").toLowerCase();
    if (mobileMode === "simulation") {
      executionCaveats.mobile_agent =
        "Mobile path is dev/simulation in this deployment (no native app executor).";
    }

    const browserSockets = this.realtime.countExecutorDispatchTargets(userId, "browser_agent", null);
    const browserLive = browserSockets > 0;
    endpoints.push({
      bridgeKind: "browser_agent",
      platform: "browser",
      deviceId: null,
      state: browserLive ? "live" : "offline",
      lastSeenAt: browserLive ? resolvedAt : null,
      reason: browserLive ? null : "no_browser_executor_socket",
      backgroundExecution: false,
      pushCapability: { supported: false, tokenRegistered: false },
      supportedActions: malvSupportedActionsForPlatform("browser"),
      caveats: ["Browser actions are tab/session scoped."]
    });

    for (const ch of ["mobile", "desktop"] as const) {
      const kind: MalvBridgeKind = ch === "mobile" ? "mobile_agent" : "desktop_agent";
      const platform = ch === "mobile" ? "android" : "desktop";
      const pushCapability =
        ch === "mobile"
          ? this.pushRegistry.tokenState(userId, "android")
          : { supported: false as const, tokenRegistered: false, count: 0 };
      const supportedActions = malvSupportedActionsForPlatform(platform);
      const last = await this.enrollment.lastHeartbeat(userId, ch);
      const socketN = this.realtime.countExecutorDispatchTargets(userId, kind, null);
      if (!last) {
        endpoints.push({
          bridgeKind: kind,
          platform,
          deviceId: null,
          state: "offline",
          lastSeenAt: null,
          reason: "no_executor_enrollment",
          pushCapability,
          backgroundExecution: platform === "android" || platform === "desktop",
          supportedActions
        });
        continue;
      }
      const age = now.getTime() - last.getTime();
      const heartbeatFresh = age <= threshold;
      if (!heartbeatFresh) {
        endpoints.push({
          bridgeKind: kind,
          platform,
          deviceId: null,
          state: "stale",
          lastSeenAt: last.toISOString(),
          reason: "heartbeat_stale",
          pushCapability,
          backgroundExecution: platform === "android" || platform === "desktop",
          supportedActions
        });
        continue;
      }
      if (socketN <= 0) {
        endpoints.push({
          bridgeKind: kind,
          platform,
          deviceId: null,
          state: "offline",
          lastSeenAt: last.toISOString(),
          reason: "executor_socket_offline",
          pushCapability,
          backgroundExecution: platform === "android" || platform === "desktop",
          supportedActions
        });
        continue;
      }
      endpoints.push({
        bridgeKind: kind,
        platform,
        deviceId: null,
        state: "live",
        lastSeenAt: last.toISOString(),
        reason: kind === "mobile_agent" && mobileMode === "simulation" ? "live_dev_simulator" : null,
        pushCapability,
        backgroundExecution: platform === "android" || platform === "desktop",
        supportedActions,
        caveats: kind === "mobile_agent" && mobileMode === "simulation" ? [executionCaveats.mobile_agent ?? "simulation"] : []
      });
    }

    const iosPush = this.pushRegistry.tokenState(userId, "ios");
    endpoints.push({
      bridgeKind: "mobile_agent",
      platform: "ios",
      deviceId: null,
      state: "offline",
      lastSeenAt: null,
      reason: "native_ios_executor_not_enrolled",
      pushCapability: iosPush,
      backgroundExecution: false,
      supportedActions: malvSupportedActionsForPlatform("ios"),
      caveats: ["iOS executor path is scaffolded; foreground constraints are enforced."]
    });

    const ha = this.smartHome.getBridgeHealth();
    const haLive = Boolean(ha.reachable);
    endpoints.push({
      bridgeKind: "home_assistant_bridge",
      platform: null,
      deviceId: null,
      state: haLive ? "live" : "offline",
      lastSeenAt: haLive ? ha.checkedAt : null,
      reason: haLive ? null : ha.configured ? "bridge_not_reachable" : "bridge_not_configured"
    });

    const liveBridgeKinds = endpoints.filter((e) => e.state === "live").map((e) => e.bridgeKind);

    return {
      resolvedAt,
      staleThresholdMs: threshold,
      endpoints,
      liveBridgeKinds,
      executionCaveats: Object.keys(executionCaveats).length ? executionCaveats : undefined,
      actionMatrixVersion: "v1"
    };
  }

  /** Compact list for meta-router / legacy consumers. */
  async resolveLiveBridgeIds(userId: string, now = new Date()): Promise<MalvBridgeKind[]> {
    const r = await this.resolveForUser(userId, now);
    return r.liveBridgeKinds;
  }
}
