import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from "@nestjs/websockets";
import { randomUUID } from "crypto";
import { Server, Socket } from "socket.io";
import { forwardRef, Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { DataSource } from "typeorm";
import { ChatService } from "../chat/chat.service";
import { ChatRunRegistryService } from "../chat/chat-run-registry.service";
import { VoiceOperatorService } from "../voice/voice-operator.service";
import { VoiceSttSessionService } from "../voice/voice-stt-session.service";
import { RateLimitService } from "../common/rate-limit/rate-limit.service";
import { CallsService } from "../calls/calls.service";
import { RoomsService } from "../collaboration/rooms.service";
import { SupportTicketEntity } from "../db/entities/support-ticket.entity";
import { UserEntity } from "../db/entities/user.entity";
import { ObservabilityService } from "../common/observability.service";
import { MalvStudioSessionEntity } from "../db/entities/malv-studio-session.entity";
import { StudioSessionStreamService } from "../malv-studio/studio-session-stream.service";
import { MALV_CHAT_AGENT_UNAVAILABLE_USER_MESSAGE } from "../beast/malv-chat-agent-unavailable.constants";
import { MalvExecutorEnrollmentService } from "../execution-bridge/malv-executor-enrollment.service";
import type { MalvExecutorEnrollmentChannel } from "../db/entities/malv-user-executor-enrollment.entity";
import type { MalvBridgeKind } from "../execution-bridge/malv-bridge-capability.types";
import { buildMalvTransportDecisionSnapshot } from "../chat/malv-transport-parity.util";
import { MalvValidationTelemetryService } from "../common/malv-validation-telemetry.service";
import { malvSimulationEnabled, malvWsPhaseProgressEnabled } from "../common/malv-validation-flags.util";
import { MalvFeatureFlagsService } from "../common/malv-feature-flags.service";
import { assertMalvAssistantIdentityGate, finalizeAssistantOutput } from "../beast/malv-finalize-assistant-output.util";
import { resolveMalvCanonicalVisibleAssistantText } from "../beast/malv-canonical-visible-answer.util";
import { pickMalvRichAssistantMetaForCompletionHandoff } from "../beast/malv-chat-assistant-meta-sanitize.util";

function formatErrorForLog(err: unknown) {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  if (err && typeof err === "object") return err as Record<string, unknown>;
  return { message: String(err) };
}

function isExecutorChannel(v: string): boolean {
  return v === "browser" || v === "desktop" || v === "mobile";
}

function normalizeWsTurnOutcome(meta: Record<string, unknown> | null | undefined): "complete" | "partial_done" {
  const explicitOutcome = typeof meta?.malvTurnOutcome === "string" ? meta.malvTurnOutcome.trim().toLowerCase() : "";
  if (explicitOutcome === "partial_done" || explicitOutcome === "failed_before_output") {
    return "partial_done";
  }

  const cancelledSignals = [
    meta?.malvStreamCancelled,
    meta?.cancelled,
    meta?.malvCancelled,
    meta?.malvInferenceCancelled
  ];
  if (cancelledSignals.some((v) => v === true)) {
    return "partial_done";
  }

  const finishReasonCandidate = [meta?.malvLastFinishReason, meta?.finishReason, meta?.finish_reason, meta?.stopReason].find(
    (v): v is string => typeof v === "string" && v.trim().length > 0
  );
  if (finishReasonCandidate) {
    const finishReason = finishReasonCandidate.trim().toLowerCase();
    const completeFinishReasons = new Set(["stop", "completed", "complete", "done", "success", "eos", "end_turn"]);
    if (!completeFinishReasons.has(finishReason)) {
      return "partial_done";
    }
  }

  if (explicitOutcome === "complete") {
    return "complete";
  }

  // Keep backward compatibility when upstream has no explicit outcome/signal,
  // while still enforcing partial classification whenever negative terminal clues exist.
  return "complete";
}

/** Match `main.ts` HTTP CORS: comma-separated origins, incl. 127.0.0.1 for Vite. */
function socketIoCorsOrigins(): string | string[] {
  const raw =
    process.env.SOCKET_CORS_ORIGIN ||
    process.env.WEB_ORIGIN ||
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000";
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) return "http://localhost:5173";
  if (list.length === 1) return list[0]!;
  return list;
}

@WebSocketGateway({
  namespace: "/malv",
  cors: {
    origin: socketIoCorsOrigins(),
    credentials: true
  },
  transports: ["websocket", "polling"]
})
@Injectable()
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly voiceDebug = process.env.MALV_VOICE_DEBUG === "true";

  private readonly socketsToUser = new Map<string, string>();
  private readonly socketCallRooms = new Map<string, Set<string>>();
  private readonly socketCollabRooms = new Map<string, Set<string>>();
  private readonly socketStudioSessions = new Map<string, Set<string>>();
  private readonly roomPresence = new Map<string, Map<string, Set<string>>>();
  private readonly roomLastActiveAt = new Map<string, Map<string, number>>();

  constructor(
    private readonly jwt: JwtService,
    @Inject(forwardRef(() => ChatService)) private readonly chat: ChatService,
    private readonly chatRuns: ChatRunRegistryService,
    @Inject(forwardRef(() => CallsService)) private readonly calls: CallsService,
    @Inject(forwardRef(() => StudioSessionStreamService)) private readonly studioStream: StudioSessionStreamService,
    private readonly rooms: RoomsService,
    private readonly voice: VoiceOperatorService,
    private readonly voiceStt: VoiceSttSessionService,
    private readonly rateLimit: RateLimitService,
    private readonly dataSource: DataSource,
    private readonly observability: ObservabilityService,
    private readonly validationTelemetry: MalvValidationTelemetryService,
    private readonly flags: MalvFeatureFlagsService,
    @Optional() @Inject(forwardRef(() => MalvExecutorEnrollmentService))
    private readonly executorEnrollment?: MalvExecutorEnrollmentService
  ) {}

  private disconnectWithReason(client: Socket, reason: string) {
    (client as any).data = { ...((client as any).data ?? {}), disconnectReason: reason };
    client.disconnect(true);
  }

  private async isSocketAuthFresh(client: Socket, userId: string): Promise<boolean> {
    const iatSec = Number(((client as any).data?.iatSec as number | undefined) ?? 0);
    if (!Number.isFinite(iatSec) || iatSec <= 0) return false;
    const user = await this.dataSource.getRepository(UserEntity).findOne({ where: { id: userId } });
    if (!user || !user.isActive) return false;
    const updatedSec = Math.floor(user.updatedAt.getTime() / 1000);
    return iatSec >= updatedSec;
  }

  private async enforceWsRateLimit(args: {
    userId: string;
    routeKey: string;
    limit: number;
    windowSeconds?: number;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    const windowSeconds = args.windowSeconds ?? 60;
    const bucket = await this.rateLimit.check({
      routeKey: args.routeKey,
      limitKey: `user:${args.userId}`,
      limit: args.limit,
      windowSeconds
    });
    if (bucket.allowed) return { ok: true };
    await this.rateLimit.recordHit({
      userId: args.userId,
      routeKey: args.routeKey,
      limitKey: `user:${args.userId}`,
      windowSeconds,
      hitCount: 1
    });
    return { ok: false, error: "Rate limit exceeded" };
  }

  private async requireMutatingSocketUser(client: Socket): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
    const userId = this.socketsToUser.get(client.id);
    if (!userId) return { ok: false, error: "Unauthorized" };
    if (!(await this.isSocketAuthFresh(client, userId))) {
      this.disconnectWithReason(client, "stale_socket_auth");
      return { ok: false, error: "Unauthorized" };
    }
    return { ok: true, userId };
  }

  private bridgeToExecutorChannel(bridge: MalvBridgeKind): MalvExecutorEnrollmentChannel | null {
    if (bridge === "browser_agent") return "browser";
    if (bridge === "desktop_agent") return "desktop";
    if (bridge === "mobile_agent") return "mobile";
    return null;
  }

  private sanitizeExecutorDeviceRoomSegment(deviceId: string): string {
    return deviceId.trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
  }

  /** All executors of a channel for a user (broadcast when no target device). */
  executorParentRoomName(userId: string, ch: MalvExecutorEnrollmentChannel): string {
    return `malv_exec:${userId}:${ch}`;
  }

  /** Single device/tab — server-side targeting for external dispatch. */
  executorDeviceRoomName(userId: string, ch: MalvExecutorEnrollmentChannel, deviceId: string): string {
    return `malv_exec:${userId}:${ch}:${this.sanitizeExecutorDeviceRoomSegment(deviceId)}`;
  }

  private joinExecutorSocketRooms(client: Socket, userId: string, ch: MalvExecutorEnrollmentChannel, deviceId: string | null) {
    client.join(this.executorParentRoomName(userId, ch));
    if (deviceId) {
      client.join(this.executorDeviceRoomName(userId, ch, deviceId));
    }
  }

  /**
   * Connected executor sockets for external dispatch (not the same as any authenticated tab).
   */
  countExecutorDispatchTargets(userId: string, bridge: MalvBridgeKind, targetDeviceId: string | null): number {
    const ch = this.bridgeToExecutorChannel(bridge);
    if (!ch || !this.server?.sockets?.adapter) return 0;
    const adapter = this.server.sockets.adapter;
    const room =
      targetDeviceId && targetDeviceId.trim().length > 0
        ? this.executorDeviceRoomName(userId, ch, targetDeviceId)
        : this.executorParentRoomName(userId, ch);
    return adapter.rooms.get(room)?.size ?? 0;
  }

  /**
   * Emits only to executor room(s) for the bridge; returns recipient socket count (0 if nothing emitted).
   */
  emitExternalActionDispatch(userId: string, bridge: MalvBridgeKind, targetDeviceId: string | null, event: string, payload: unknown): number {
    const ch = this.bridgeToExecutorChannel(bridge);
    if (!ch || !this.server?.sockets?.adapter) return 0;
    const room =
      targetDeviceId && targetDeviceId.trim().length > 0
        ? this.executorDeviceRoomName(userId, ch, targetDeviceId)
        : this.executorParentRoomName(userId, ch);
    const n = this.server.sockets.adapter.rooms.get(room)?.size ?? 0;
    if (n === 0) return 0;
    this.server.to(room).emit(event, payload);
    return n;
  }

  async handleConnection(client: Socket) {
    this.logger.log(`Socket connected: ${client.id}`);

    const token = (client.handshake.auth as any)?.token as string | undefined;
    if (token) {
      try {
        const payload = (await this.jwt.verifyAsync(token.replace(/^Bearer\s+/i, ""))) as {
          sub?: string;
          role?: string;
          iat?: number;
        };
        const userId = payload?.sub as string | undefined;
        const role = payload?.role === "admin" ? "admin" : "user";
        if (userId) {
          const user = await this.dataSource.getRepository(UserEntity).findOne({ where: { id: userId } });
          if (!user || !user.isActive) {
            this.disconnectWithReason(client, "inactive_or_missing_user");
            return;
          }
          const iatSec = Number(payload?.iat ?? 0);
          const updatedSec = Math.floor(user.updatedAt.getTime() / 1000);
          if (!Number.isFinite(iatSec) || iatSec < updatedSec) {
            this.disconnectWithReason(client, "stale_token_iat");
            return;
          }
          const rawChannel = (client.handshake.auth as Record<string, unknown> | undefined)?.malvExecutorChannel;
          const ch =
            typeof rawChannel === "string" && isExecutorChannel(rawChannel) ? (rawChannel as MalvExecutorEnrollmentChannel) : null;
          const rawDev = (client.handshake.auth as Record<string, unknown> | undefined)?.malvExecutorDeviceId;
          let deviceId =
            typeof rawDev === "string" && rawDev.trim().length > 0 ? rawDev.trim().slice(0, 128) : null;
          if (ch === "browser" && !deviceId) {
            deviceId = "default";
          }
          (client as any).data = { userId, role, iatSec, executorChannel: ch ?? undefined, executorDeviceId: deviceId };
          const room = `user:${userId}`;
          client.join(room);
          this.socketsToUser.set(client.id, userId);
          client.emit("presence:state", { online: true, at: Date.now(), userId });
          if (ch) {
            this.joinExecutorSocketRooms(client, userId, ch, deviceId);
            void this.executorEnrollment?.touchHeartbeat(userId, ch, { deviceId });
          }
          return;
        }
      } catch (e) {
        this.observability.incAuthFailure({ reason: "ws_token_verify_failed", channel: "ws" });
        // Keep connection but do not join user room.
        this.logger.warn(
          JSON.stringify({
            tag: "ws.auth.failed",
            socketId: client.id,
            error: e instanceof Error ? e.message : String(e)
          })
        );
      }
    }

    client.emit("presence:state", { online: true, at: Date.now(), userId: null });
  }

  handleDisconnect(client: Socket) {
    const nsp = client.nsp?.name ?? "(unknown)";
    const reason = (client as any).data?.disconnectReason ?? "client_or_transport";
    this.observability.incWebsocketDisconnect(reason);
    this.logger.log(
      JSON.stringify({
        tag: "ws.disconnect",
        socketId: client.id,
        namespace: nsp,
        reason,
        hadUserBinding: Boolean(this.socketsToUser.get(client.id))
      })
    );

    const userId = this.socketsToUser.get(client.id);
    const joinedCalls = Array.from(this.socketCallRooms.get(client.id) ?? []);
    const joinedCollabRooms = Array.from(this.socketCollabRooms.get(client.id) ?? []);
    if (userId) {
      this.emitToUser(userId, "presence:state", { online: false, at: Date.now() });
      this.socketsToUser.delete(client.id);
      for (const callSessionId of joinedCalls) {
        void this.calls.markReconnecting({ userId, callSessionId, reason: "socket_disconnect" }).catch((err) => {
          this.logger.warn(
            `call reconnecting mark failed userId=${userId} callSessionId=${callSessionId} err=${err instanceof Error ? err.message : String(err)}`
          );
        });
      }
    } else {
      client.emit("presence:state", { online: false, at: Date.now() });
    }
    if (userId) {
      for (const roomId of joinedCollabRooms) {
        this.detachRoomPresence({ roomId, userId, socketId: client.id });
      }
    }
    this.socketCallRooms.delete(client.id);
    this.socketCollabRooms.delete(client.id);
    this.socketStudioSessions.delete(client.id);
  }

  @SubscribeMessage("presence:ping")
  onPing(@MessageBody() payload: any) {
    return { ok: true, receivedAt: Date.now(), payload };
  }

  @SubscribeMessage("room:join")
  async onRoomJoin(@MessageBody() payload: { roomId: string }, @ConnectedSocket() client: Socket) {
    const auth = await this.requireMutatingSocketUser(client);
    if (!auth.ok) return auth;
    const userId = auth.userId;
    await this.rooms.assertMember({ userId, roomId: payload.roomId });
    const roomName = `room:${payload.roomId}`;
    client.join(roomName);
    const joined = this.socketCollabRooms.get(client.id) ?? new Set<string>();
    joined.add(payload.roomId);
    this.socketCollabRooms.set(client.id, joined);
    this.attachRoomPresence({ roomId: payload.roomId, userId, socketId: client.id });
    return { ok: true };
  }

  @SubscribeMessage("room:leave")
  async onRoomLeave(@MessageBody() payload: { roomId: string }, @ConnectedSocket() client: Socket) {
    const auth = await this.requireMutatingSocketUser(client);
    if (!auth.ok) return auth;
    const userId = auth.userId;
    await this.rooms.assertMember({ userId, roomId: payload.roomId });
    const roomName = `room:${payload.roomId}`;
    client.leave(roomName);
    this.detachRoomPresence({ roomId: payload.roomId, userId, socketId: client.id });
    const joined = this.socketCollabRooms.get(client.id);
    if (joined) {
      joined.delete(payload.roomId);
      if (joined.size === 0) this.socketCollabRooms.delete(client.id);
      else this.socketCollabRooms.set(client.id, joined);
    }
    return { ok: true };
  }

  @SubscribeMessage("studio:join_session")
  async onStudioJoin(@MessageBody() payload: { sessionId: string }, @ConnectedSocket() client: Socket) {
    const auth = await this.requireMutatingSocketUser(client);
    if (!auth.ok) return auth;
    const userId = auth.userId;
    const session = await this.dataSource.getRepository(MalvStudioSessionEntity).findOne({
      where: { id: payload.sessionId, user: { id: userId } }
    });
    if (!session) return { ok: false, error: "Studio session not found." };
    const roomName = `studio:${payload.sessionId}`;
    client.join(roomName);
    const joined = this.socketStudioSessions.get(client.id) ?? new Set<string>();
    joined.add(payload.sessionId);
    this.socketStudioSessions.set(client.id, joined);
    const replay = await this.studioStream.replayForSession(payload.sessionId);
    if (replay.length > 0) {
      client.emit("studio:runtime_replay", { sessionId: payload.sessionId, events: replay });
    }
    return { ok: true };
  }

  @SubscribeMessage("studio:leave_session")
  async onStudioLeave(@MessageBody() payload: { sessionId: string }, @ConnectedSocket() client: Socket) {
    const auth = await this.requireMutatingSocketUser(client);
    if (!auth.ok) return auth;
    const userId = auth.userId;
    const session = await this.dataSource.getRepository(MalvStudioSessionEntity).findOne({
      where: { id: payload.sessionId, user: { id: userId } }
    });
    if (!session) return { ok: false, error: "Studio session not found." };
    const roomName = `studio:${payload.sessionId}`;
    client.leave(roomName);
    const joined = this.socketStudioSessions.get(client.id);
    if (joined) {
      joined.delete(payload.sessionId);
      if (joined.size === 0) this.socketStudioSessions.delete(client.id);
      else this.socketStudioSessions.set(client.id, joined);
    }
    return { ok: true };
  }

  @SubscribeMessage("room:activity")
  async onRoomActivity(@MessageBody() payload: { roomId: string }, @ConnectedSocket() client: Socket) {
    const auth = await this.requireMutatingSocketUser(client);
    if (!auth.ok) return auth;
    const userId = auth.userId;
    await this.rooms.assertMember({ userId, roomId: payload.roomId });
    this.touchRoomActivity(payload.roomId, userId);
    this.emitRoomPresence(payload.roomId);
    return { ok: true, at: Date.now() };
  }

  @SubscribeMessage("support:join_ticket")
  async onSupportJoin(@MessageBody() payload: { ticketId: string }, @ConnectedSocket() client: Socket) {
    const auth = await this.requireMutatingSocketUser(client);
    if (!auth.ok) return auth;
    const userId = auth.userId;
    const limiter = await this.enforceWsRateLimit({
      userId,
      routeKey: "ws.support.join_ticket",
      limit: Number(process.env.RATE_LIMIT_WS_SUPPORT_JOIN_PER_MINUTE ?? 30)
    });
    if (!limiter.ok) return limiter;
    const ticket = await this.dataSource.getRepository(SupportTicketEntity).findOne({
      where: { id: payload.ticketId, user: { id: userId } }
    });
    if (!ticket) return { ok: false, error: "Ticket not found" };
    const room = `ticket:${payload.ticketId}`;
    client.join(room);
    client.emit("support:room_joined", { ticketId: payload.ticketId });
    return { ok: true };
  }

  @SubscribeMessage("call:join_room")
  async onCallJoin(@MessageBody() payload: { callSessionId: string }, @ConnectedSocket() client: Socket) {
    const auth = await this.requireMutatingSocketUser(client);
    if (!auth.ok) return auth;
    const userId = auth.userId;
    const limiter = await this.enforceWsRateLimit({
      userId,
      routeKey: "ws.call.join_room",
      limit: Number(process.env.RATE_LIMIT_WS_CALL_JOIN_PER_MINUTE ?? 60)
    });
    if (!limiter.ok) return limiter;
    await this.calls.joinCall({ userId, callSessionId: payload.callSessionId });
    const room = `call:${payload.callSessionId}`;
    client.join(room);
    const rooms = this.socketCallRooms.get(client.id) ?? new Set<string>();
    rooms.add(payload.callSessionId);
    this.socketCallRooms.set(client.id, rooms);
    this.server.to(room).emit("call:presence", { userId, action: "join", at: Date.now() });
    try {
      await this.calls.beginVoiceOnboardingIfNeeded({ userId, callSessionId: payload.callSessionId });
    } catch (e) {
      this.logger.warn(
        `beginVoiceOnboardingIfNeeded failed userId=${userId} callSessionId=${payload.callSessionId} err=${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }
    const latest = await this.calls.getCall({ userId, callSessionId: payload.callSessionId });
    return { ok: true, runtime: latest.runtime };
  }

  @SubscribeMessage("call:end")
  async onCallEnd(@MessageBody() payload: { callSessionId?: string | null }, @ConnectedSocket() client: Socket) {
    const auth = await this.requireMutatingSocketUser(client);
    if (!auth.ok) return { ok: false as const, error: auth.error };
    const userId = auth.userId;
    const callSessionId = typeof payload?.callSessionId === "string" ? payload.callSessionId : null;
    if (!callSessionId) return { ok: false as const, error: "callSessionId required" };

    let persistError: string | null = null;
    try {
      await this.calls.updateCallState({ userId, callSessionId, status: "ended" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      persistError = msg;
      this.logger.warn(`call:end updateCallState failed userId=${userId} callSessionId=${callSessionId} err=${msg}`);
    }

    /** Always drop in-memory STT sessions so chunks stop even if DB write failed. */
    this.voiceStt.endAllSessionsForCall({ userId, callSessionId });

    const room = `call:${callSessionId}`;
    try {
      client.leave(room);
    } catch {
      /* noop */
    }
    const rooms = this.socketCallRooms.get(client.id);
    if (rooms) {
      rooms.delete(callSessionId);
      if (rooms.size === 0) this.socketCallRooms.delete(client.id);
      else this.socketCallRooms.set(client.id, rooms);
    }

    this.emitToUser(userId, "call:ended", {
      callSessionId,
      at: Date.now(),
      persistError: persistError ?? undefined
    });

    return persistError ? ({ ok: false as const, error: persistError } as const) : ({ ok: true as const } as const);
  }

  @SubscribeMessage("call:heartbeat")
  async onCallHeartbeat(
    @MessageBody() payload: { callSessionId: string; observedRttMs?: number | null },
    @ConnectedSocket() client: Socket
  ) {
    const auth = await this.requireMutatingSocketUser(client);
    if (!auth.ok) return auth;
    const userId = auth.userId;
    const call = await this.calls.heartbeat({
      userId,
      callSessionId: payload.callSessionId,
      observedRttMs: payload.observedRttMs ?? null
    });
    return { ok: true, receivedAt: Date.now(), runtime: call.runtime };
  }

  @SubscribeMessage("call:playback_state")
  async onCallPlaybackState(
    @MessageBody() payload: { callSessionId: string; isSpeaking: boolean },
    @ConnectedSocket() client: Socket
  ) {
    const auth = await this.requireMutatingSocketUser(client);
    if (!auth.ok) return auth;
    const userId = auth.userId;
    const call = await this.calls.markPlaybackState({
      userId,
      callSessionId: payload.callSessionId,
      isSpeaking: Boolean(payload.isSpeaking)
    });
    return { ok: true, runtime: call.runtime };
  }

  @SubscribeMessage("call:signal")
  async onCallSignal(
    @MessageBody() payload: { callSessionId: string; kind: "offer" | "answer" | "ice"; sdp?: string; candidate?: unknown },
    @ConnectedSocket() client: Socket
  ) {
    const auth = await this.requireMutatingSocketUser(client);
    if (!auth.ok) return auth;
    const userId = auth.userId;
    const limiter = await this.enforceWsRateLimit({
      userId,
      routeKey: "ws.call.signal",
      limit: Number(process.env.RATE_LIMIT_WS_CALL_SIGNAL_PER_MINUTE ?? 600)
    });
    if (!limiter.ok) return limiter;
    await this.calls.assertUserOwnsCall({ userId, callSessionId: payload.callSessionId });
    const joined = this.socketCallRooms.get(client.id);
    if (!joined || !joined.has(payload.callSessionId)) {
      return { ok: false, error: "Join call room first" };
    }
    const room = `call:${payload.callSessionId}`;
    client.to(room).emit("call:signal", {
      callSessionId: payload.callSessionId,
      fromUserId: userId,
      kind: payload.kind,
      sdp: payload.sdp ?? null,
      candidate: payload.candidate ?? null,
      at: Date.now()
    });
    return { ok: true };
  }

  @SubscribeMessage("voice:start")
  async onVoiceStart(
    @MessageBody() payload: { sessionId?: string | null; sessionTarget?: "composer_chat" | "operator"; callSessionId?: string | null },
    @ConnectedSocket() client: Socket
  ) {
    const auth = await this.requireMutatingSocketUser(client);
    if (!auth.ok) return auth;
    const userId = auth.userId;
    const sessionTarget = payload?.sessionTarget ?? (payload?.callSessionId ? "operator" : undefined);
    if (payload.callSessionId) {
      await this.calls.markCaptureStarted({ userId, callSessionId: payload.callSessionId });
    }
    if (payload?.sessionId && sessionTarget) {
      this.voiceStt.startSession({
        userId,
        sessionId: payload.sessionId,
        sessionTarget,
        callSessionId: payload.callSessionId ?? null
      });
    }
    // eslint-disable-next-line no-console
    console.debug("[voice_api] start", {
      sessionId: payload?.sessionId ?? null,
      sessionTarget: sessionTarget ?? null,
      userId
    });
    if (this.voiceDebug) {
      this.logger.debug(`voice:start received userId=${userId} sessionId=${payload?.sessionId ?? null} target=${sessionTarget ?? null}`);
    }
    this.emitToUser(userId, "voice:session", {
      phase: "start",
      sessionId: payload?.sessionId ?? null,
      sessionTarget: sessionTarget ?? null,
      callSessionId: payload?.callSessionId ?? null,
      at: Date.now()
    });
    return { ok: true };
  }

  @SubscribeMessage("voice:stop")
  async onVoiceStop(
    @MessageBody() payload: { sessionId?: string | null; reason?: string | null; recordingDurationMs?: number | null },
    @ConnectedSocket() client: Socket
  ) {
    const auth = await this.requireMutatingSocketUser(client);
    if (!auth.ok) return auth;
    const userId = auth.userId;
    this.emitToUser(userId, "voice:session", { phase: "stop", sessionId: payload?.sessionId ?? null, at: Date.now() });
    if (payload?.sessionId) {
      try {
        if (this.voiceDebug) {
          this.logger.debug(`voice:stop received userId=${userId} sessionId=${payload.sessionId} reason=${payload.reason ?? null}`);
        }
        // eslint-disable-next-line no-console
        console.debug("[voice_api] stop", { sessionId: payload.sessionId });
        const callSessionId = this.voiceStt.getCallSessionIdForSession({ userId, sessionId: payload.sessionId });
        if (callSessionId) {
          await this.calls.markCaptureFinalizing({ userId, callSessionId });
        }
        await this.voiceStt.stopAndFinalize({
          userId,
          sessionId: payload.sessionId,
          reason: payload.reason ?? null,
          recordingDurationMs: payload.recordingDurationMs ?? null
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const callSessionId = this.voiceStt.getCallSessionIdForSession({ userId, sessionId: payload.sessionId });
        this.logger.warn(`voice:stop finalize threw userId=${userId} sessionId=${payload.sessionId} err=${msg}`);
        if (this.voiceDebug) {
          // eslint-disable-next-line no-console
          console.error(`[malv-voice] voice_api:error`, {
            userId,
            sessionId: payload.sessionId,
            reason: payload.reason ?? null,
            stage: "voice:stop_finalize_exception",
            error: formatErrorForLog(e)
          });
        }
        // eslint-disable-next-line no-console
        console.error(`[malv-voice] voice:stop finalize threw`, {
          userId,
          sessionId: payload.sessionId,
          reason: payload.reason ?? null,
          error: formatErrorForLog(e)
        });
        // eslint-disable-next-line no-console
        console.error("[voice_api] error", {
          sessionId: payload.sessionId,
          sessionTarget: null,
          stage: "voice:stop_finalize_exception",
          error: msg
        });
        this.emitToUser(userId, "voice:error", {
          message: "Voice finalize failed.",
          code: "finalize_exception",
          sessionId: payload.sessionId
        });
        if (callSessionId) {
          await this.calls.markVoiceError({ userId, callSessionId, message: msg, code: "finalize_exception" });
        }
      }
    }
    return { ok: true };
  }

  @SubscribeMessage("voice:cancel")
  async onVoiceCancel(@MessageBody() payload: { sessionId?: string | null }, @ConnectedSocket() client: Socket) {
    const auth = await this.requireMutatingSocketUser(client);
    if (!auth.ok) return auth;
    const userId = auth.userId;
    this.emitToUser(userId, "voice:session", { phase: "cancel", sessionId: payload?.sessionId ?? null, at: Date.now() });
    if (payload?.sessionId) {
      const callSessionId = this.voiceStt.getCallSessionIdForSession({ userId, sessionId: payload.sessionId });
      if (callSessionId) {
        void this.calls.markPlaybackState({ userId, callSessionId, isSpeaking: false }).catch(() => {
          /* noop */
        });
      }
      this.voiceStt.cancelSession({ userId, sessionId: payload.sessionId });
    }
    return { ok: true };
  }

  /** Self-hosted audio ingest for local STT (no external speech APIs). */
  @SubscribeMessage("voice:chunk")
  async onVoiceChunk(
    @MessageBody()
    payload: {
      sessionId?: string | null;
      sessionTarget?: "composer_chat" | "operator";
      seq?: number;
      mimeType?: string | null;
      audioB64?: string | null;
    },
    @ConnectedSocket() client: Socket
  ) {
    const auth = await this.requireMutatingSocketUser(client);
    if (!auth.ok) return auth;
    const userId = auth.userId;
    const sessionId = payload?.sessionId ?? null;
    const sessionTarget = payload?.sessionTarget ?? null;
    const seq = Number(payload?.seq ?? -1);
    const mimeType = payload?.mimeType ?? "audio/webm";
    const audioB64 = payload?.audioB64 ?? "";
    if (!sessionId || !sessionTarget || !Number.isFinite(seq) || seq < 0 || !audioB64) {
      return { ok: false, error: "invalid_chunk" };
    }
    const bytesApprox = Math.floor((audioB64.length * 3) / 4);
    const maxChunkBytes = Number(process.env.WS_VOICE_CHUNK_MAX_BYTES ?? 1_048_576);
    if (bytesApprox > maxChunkBytes) {
      return { ok: false, error: "Chunk too large" };
    }
    const bucket = await this.enforceWsRateLimit({
      userId,
      routeKey: "ws.voice.chunk",
      limit: Number(process.env.RATE_LIMIT_VOICE_CHUNKS_PER_MINUTE ?? 420)
    });
    if (!bucket.ok) return bucket;
    // eslint-disable-next-line no-console
    console.debug("[voice_api] chunk", { sessionId, bytes: bytesApprox });
    if (this.voiceDebug) {
      // Avoid logging full audio payload; only log sizes.
      this.logger.debug(
        `voice:chunk received userId=${userId} sessionId=${sessionId} seq=${seq} mimeType=${mimeType} audioB64len=${audioB64.length} approxBytes=${bytesApprox}`
      );
    }
    this.voiceStt.ingestChunk({
      userId,
      payload: { sessionId, sessionTarget, seq, mimeType, audioB64 }
    });
    return { ok: true };
  }

  @SubscribeMessage("voice:transcript_chunk")
  async onVoiceTranscript(
    @MessageBody()
    payload: {
      callSessionId?: string | null;
      text: string;
      isFinal: boolean;
      sessionTarget?: "composer_chat" | "operator";
      sessionId?: string | null;
      contextHint?: {
        page?: string | null;
        selectedFile?: string | null;
        activeConversationId?: string | null;
        activeTaskId?: string | null;
        issueId?: string | null;
        workspacePath?: string | null;
        workspaceId?: string | null;
        currentSymbol?: string | null;
        currentSpanStart?: number | null;
        currentSpanEnd?: number | null;
      };
    },
    @ConnectedSocket() client: Socket
  ) {
    const auth = await this.requireMutatingSocketUser(client);
    if (!auth.ok) return auth;
    const userId = auth.userId;
    const bucket = await this.rateLimit.check({
      routeKey: "ws.voice.transcript",
      limitKey: `user:${userId}`,
      limit: Number(process.env.RATE_LIMIT_VOICE_PER_MINUTE ?? 90),
      windowSeconds: 60
    });
    if (!bucket.allowed) {
      await this.rateLimit.recordHit({
        userId,
        routeKey: "ws.voice.transcript",
        limitKey: `user:${userId}`,
        windowSeconds: 60,
        hitCount: 1
      });
      return { ok: false, error: "Rate limit exceeded" };
    }
    try {
      const role = ((client as any).data?.role as "admin" | "user" | undefined) ?? "user";
      const sessionTarget = payload.sessionTarget ?? (payload.callSessionId ? "operator" : undefined);
      return await this.voice.handleVoiceUtterance({
        userId,
        userRole: role,
        callSessionId: payload.callSessionId ?? null,
        transcriptText: payload.text,
        isFinal: payload.isFinal,
        contextHint: payload.contextHint ?? null,
        sessionTarget,
        sessionId: payload.sessionId ?? null
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      if (payload.callSessionId) {
        await this.calls.markVoiceError({
          userId,
          callSessionId: payload.callSessionId,
          message: errMsg,
          code: "voice_transcript_handler_error"
        });
      }
      this.emitToUser(userId, "voice:error", { message: "Voice transcript handling failed.", code: "voice_transcript_handler_error" });
      return { ok: false, error: errMsg };
    }
  }

  @SubscribeMessage("chat:cancel")
  async onChatCancel(
    @MessageBody() payload: { assistantMessageId?: string },
    @ConnectedSocket() client: Socket
  ) {
    const auth = await this.requireMutatingSocketUser(client);
    if (!auth.ok) return auth;
    const userId = auth.userId;
    const assistantMessageId = payload?.assistantMessageId;
    if (!assistantMessageId) return { ok: false, error: "assistantMessageId required" };
    const cancelled = await this.chatRuns.requestCancel({ assistantMessageId, userId });
    this.logger.log(
      `[MALV RUNTIME] cancel requested userId=${userId} assistantMessageId=${assistantMessageId} applied=${cancelled.localAbortApplied} distributedMarker=${cancelled.distributedMarkerRecorded}`
    );
    return {
      ok: cancelled.ok,
      localAbortApplied: cancelled.localAbortApplied,
      distributedMarkerRecorded: cancelled.distributedMarkerRecorded
    };
  }

  @SubscribeMessage("chat:send")
  async onChatSend(
    @MessageBody()
    payload: {
      conversationId?: string | null;
      message: string;
      beastLevel?: "Passive" | "Smart" | "Advanced" | "Beast";
      workspaceId?: string | null;
      vaultSessionId?: string | null;
      assistantMessageId?: string | null;
      inputMode?: "text" | "voice" | "video";
      sessionType?: string | null;
      callId?: string | null;
      audioContext?: string | null;
      transcriptChunkRef?: string | null;
      operatorPhase?: string | null;
      userMoodHint?: "stressed" | "calm" | "urgent" | "focused" | "neutral" | null;
      exploreHandoffJson?: string | null;
    },
    @ConnectedSocket() client: Socket
  ) {
    const auth = await this.requireMutatingSocketUser(client);
    if (!auth.ok) {
      this.logger.log(`[MALV E2E] api chat request received (WS chat:send) rejected: unauthorized socket=${client.id}`);
      return { ok: false, error: "Unauthorized" };
    }
    const userId = auth.userId;
    const role = ((client as any).data?.role as "admin" | "user" | undefined) ?? "user";
    if (role !== "admin") {
      if (this.flags.internalUsersOnlyMode()) {
        const allowlist = this.flags.internalUserAllowlist();
        if (!allowlist.includes(userId)) {
          return { ok: false, error: "MALV staged rollout is internal-only right now." };
        }
      }
      if (!this.flags.userInRollout(userId)) {
        return { ok: false, error: "MALV staged rollout gate denied for this account." };
      }
    }
    const bucket = await this.rateLimit.check({
      routeKey: "ws.chat.send",
      limitKey: `user:${userId}`,
      limit: Number(process.env.RATE_LIMIT_CHAT_PER_MINUTE ?? 50),
      windowSeconds: 60
    });
    if (!bucket.allowed) {
      await this.rateLimit.recordHit({
        userId,
        routeKey: "ws.chat.send",
        limitKey: `user:${userId}`,
        windowSeconds: 60,
        hitCount: 1
      });
      return { ok: false, error: "Rate limit exceeded" };
    }

    const assistantMessageId = payload.assistantMessageId;
    if (!assistantMessageId) {
      this.logger.warn(`[MALV CHAT] chat:send rejected — missing assistantMessageId`);
      return { ok: false, error: "assistantMessageId required" };
    }

    const ac = new AbortController();
    this.chatRuns.registerTurn({ assistantMessageId, userId, abortController: ac });

    this.logger.log(
      `[MALV E2E] api chat request received (WS chat:send) userId=${userId} conversationId=${payload.conversationId ?? "new"} messageLen=${payload.message?.length ?? 0} ack=immediate replyWillStream=true`
    );

    void this.runChatSendPipelineAfterAck({
      userId,
      client,
      payload,
      assistantMessageId,
      abortController: ac
    }).finally(() => {
      void this.chatRuns.unregisterTurn(assistantMessageId);
    });

    return {
      ok: true,
      conversationId: payload.conversationId ?? undefined,
      replyWillStream: true
    };
  }

  /**
   * Runs after `chat:send` ack so slow inference (e.g. local llama) does not trip the client's ack timeout.
   */
  private async runChatSendPipelineAfterAck(args: {
    userId: string;
    client: Socket;
    payload: {
      conversationId?: string | null;
      message: string;
      beastLevel?: "Passive" | "Smart" | "Advanced" | "Beast";
      workspaceId?: string | null;
      vaultSessionId?: string | null;
      inputMode?: "text" | "voice" | "video";
      sessionType?: string | null;
      callId?: string | null;
      audioContext?: string | null;
      transcriptChunkRef?: string | null;
      operatorPhase?: string | null;
      userMoodHint?: "stressed" | "calm" | "urgent" | "focused" | "neutral" | null;
      exploreHandoffJson?: string | null;
    };
    assistantMessageId: string;
    abortController: AbortController;
  }) {
    const { userId, payload, assistantMessageId } = args;
    const requestReceivedAtMs = Date.now();
    const room = `user:${userId}`;
    let wsStreamChunkIndex = 0;
    let wsStreamAccum = "";
    let wsStreamChunkQueue = Promise.resolve();
    let sawAssistantText = false;
    let turnConversationId: string | null = null;
    let turnRunId = "";
    try {
      const role = ((args.client as any).data?.role as "admin" | "user" | undefined) ?? "user";
      const simulateMissingWsCallback = malvSimulationEnabled(
        (k) => process.env[k],
        "MALV_SIMULATE_WS_CALLBACK_ABSENT"
      );
      const beastRes = await this.chat.handleChat({
        userId,
        userRole: role,
        conversationId: payload.conversationId ?? null,
        message: payload.message,
        beastLevel: payload.beastLevel,
        workspaceId: payload.workspaceId ?? null,
        vaultSessionId: payload.vaultSessionId ?? null,
        assistantMessageId,
        abortSignal: args.abortController.signal,
        runRegistryManagedExternally: true,
        deferAssistantPersist: true,
        onAssistantStreamChunk: simulateMissingWsCallback
          ? undefined
          : (evt) => {
              wsStreamChunkQueue = wsStreamChunkQueue.then(async () => {
                if (await this.chatRuns.isCancelled(assistantMessageId)) return;
                turnConversationId = evt.conversationId;
                turnRunId = evt.runId;
                this.validationTelemetry.startTurn({
                  runId: evt.runId,
                  transport: "ws",
                  requestReceivedAtMs
                });
                if (evt.text.length > 0) {
                  sawAssistantText = true;
                  wsStreamAccum += evt.text;
                  this.validationTelemetry.markFirstVisibleOutput(evt.runId, "ws");
                }
                this.server.to(room).emit("chat:reply_chunk", {
                  conversationId: evt.conversationId,
                  assistantMessageId,
                  runId: evt.runId,
                  index: wsStreamChunkIndex++,
                  done: false,
                  text: evt.text
                });
              });
              return wsStreamChunkQueue;
            },
        inputMeta: {
          inputMode: payload.inputMode,
          sessionType: payload.sessionType ?? null,
          callId: payload.callId ?? null,
          audioContext: payload.audioContext ?? null,
          transcriptChunkRef: payload.transcriptChunkRef ?? null,
          operatorPhase: payload.operatorPhase ?? null,
          userMoodHint: payload.userMoodHint ?? null,
          exploreHandoffJson: payload.exploreHandoffJson ?? null
        }
      });
      await wsStreamChunkQueue;

      const trace = beastRes.meta?.malvInferenceTrace as Record<string, unknown> | undefined;
      const transport = trace?.malvChatInferenceTransport;
      const decisionSnapshot = buildMalvTransportDecisionSnapshot(beastRes.meta ?? {});
      this.validationTelemetry.startTurn({
        runId: beastRes.runId,
        transport: "ws",
        requestReceivedAtMs
      });
      this.validationTelemetry.completeTurn({
        runId: beastRes.runId,
        transport: "ws",
        meta: beastRes.meta ?? {},
        requestReceivedAtMs
      });
      const turnOutcome = normalizeWsTurnOutcome((beastRes.meta ?? null) as Record<string, unknown> | null);
      this.logger.log(
        `[MALV CHAT WS] pipeline inference done userId=${userId} conversationId=${beastRes.conversationId} transport=${String(transport ?? "unknown")} sawLiveTokens=${sawAssistantText} turnOutcome=${turnOutcome} replyLen=${(beastRes.reply ?? "").length} interrupted=${Boolean(beastRes.interrupted)}`
      );

      const reply = beastRes.reply ?? "";
      const completionAssistantMeta = pickMalvRichAssistantMetaForCompletionHandoff(
        (beastRes.meta ?? null) as Record<string, unknown> | null
      );
      const completionAssistantMetaSpread =
        completionAssistantMeta && Object.keys(completionAssistantMeta).length > 0
          ? { assistantMeta: completionAssistantMeta }
          : {};

      if (beastRes.interrupted) {
        const rawInterrupted = (wsStreamAccum || reply).trim();
        const safeInterruptedContent =
          rawInterrupted.length === 0
            ? ""
            : sawAssistantText && wsStreamAccum.trim().length > 0
              ? finalizeAssistantOutput(wsStreamAccum, {})
              : assertMalvAssistantIdentityGate(reply);
        this.emitMalvOrchestration(userId, {
          type: "assistant_done",
          conversationId: beastRes.conversationId,
          messageId: assistantMessageId,
          finalContent: safeInterruptedContent,
          terminal: "interrupted",
          malvTurnOutcome: "partial_done",
          decisionSnapshot,
          ...completionAssistantMetaSpread
        });
        this.logger.log(
          `[MALV CHAT] assistant_done emitted (interrupted) userId=${userId} runId=${beastRes.runId} finalized_in_chat_service=true`
        );
        return;
      }

      let chunkLoopAborted = false;
      if (!sawAssistantText) {
        if (reply.length > 0) {
          if (await this.chatRuns.isCancelled(assistantMessageId)) {
            this.logger.log(`[MALV CHAT WS] non_streaming_reply_suppressed_cancelled userId=${userId}`);
            chunkLoopAborted = true;
          } else {
            wsStreamAccum = reply;
            const nonStreamChunk = assertMalvAssistantIdentityGate(reply);
            this.server.to(room).emit("chat:reply_chunk", {
              conversationId: beastRes.conversationId,
              assistantMessageId,
              runId: beastRes.runId,
              index: wsStreamChunkIndex++,
              done: false,
              text: nonStreamChunk
            });
            this.logger.log(
              `[MALV CHAT WS] non_streaming_full_reply userId=${userId} conversationId=${beastRes.conversationId} len=${reply.length}`
            );
          }
        } else {
          this.logger.log(
            `[MALV CHAT WS] non_streaming_empty_reply userId=${userId} conversationId=${beastRes.conversationId}`
          );
        }
      } else {
        this.logger.log(
          `[MALV CHAT WS] live_token_path userId=${userId} conversationId=${beastRes.conversationId} replyLen=${reply.length}`
        );
      }

      // Canonical text = orchestrator delivery (reliability + rich + shaping). Raw stream chunks are
      // progressive hints only; persistence and assistant_done must match HTTP/history.
      const canonicalPack = resolveMalvCanonicalVisibleAssistantText({
        orchestratorVisibleReply: reply,
        streamAccumulatedRaw: wsStreamAccum,
        sawLiveStreamTokens: sawAssistantText
      });
      const persistContent =
        canonicalPack.text.length > 0 ? canonicalPack.text : assertMalvAssistantIdentityGate(reply);
      const finalizeStatus = chunkLoopAborted ? ("interrupted" as const) : ("done" as const);
      const doneTerminal = chunkLoopAborted ? ("interrupted" as const) : ("completed" as const);

      this.emitMalvOrchestration(userId, {
        type: "assistant_done",
        conversationId: beastRes.conversationId,
        messageId: assistantMessageId,
        finalContent: persistContent,
        terminal: doneTerminal,
        malvTurnOutcome: chunkLoopAborted ? "partial_done" : turnOutcome,
        decisionSnapshot,
        ...completionAssistantMetaSpread
      });
      this.logger.log(
        `[MALV CHAT] assistant_done emitted userId=${userId} runId=${beastRes.runId} terminal=${doneTerminal} turnOutcome=${chunkLoopAborted ? "partial_done" : turnOutcome}`
      );

      if (beastRes.deferAssistantPersist && !beastRes.interrupted) {
        try {
          await this.chat.finalizeAssistantTurn({
            userId,
            conversationId: beastRes.conversationId,
            assistantMessageId,
            runId: beastRes.runId,
            content: persistContent,
            status: finalizeStatus,
            malvTurnOutcome: chunkLoopAborted ? "partial_done" : turnOutcome === "partial_done" ? "partial_done" : "complete",
            meta: beastRes.meta,
            source: chunkLoopAborted
              ? "interrupted"
              : String(beastRes.meta?.malvReplySource ?? "beast_pipeline")
          });
        } catch (finalizeErr) {
          this.logger.error(
            `[MALV CHAT WS] finalizeAssistantTurn failed after assistant_done userId=${userId} assistantMessageId=${assistantMessageId} detail=${JSON.stringify(formatErrorForLog(finalizeErr))}`
          );
        }
      }
    } catch (e) {
      this.logger.error(
        `[MALV CHAT WS] pipeline failed userId=${userId} assistantMessageId=${assistantMessageId} detail=${JSON.stringify(formatErrorForLog(e))}`
      );
      const cid = turnConversationId ?? payload.conversationId ?? null;
      if (sawAssistantText && cid) {
        this.logger.warn(
          `[MALV CHAT WS] stream_failed_after_output userId=${userId} assistantMessageId=${assistantMessageId} — partial_finalize`
        );
        this.emitMalvOrchestration(userId, {
          type: "assistant_done",
          conversationId: cid,
          messageId: assistantMessageId,
          finalContent: finalizeAssistantOutput(wsStreamAccum, {}),
          terminal: "completed",
          malvTurnOutcome: "partial_done",
          decisionSnapshot: buildMalvTransportDecisionSnapshot({ malvTurnOutcome: "partial_done" })
        });
        try {
          const safePartial = finalizeAssistantOutput(wsStreamAccum, {});
          await this.chat.finalizeAssistantTurn({
            userId,
            conversationId: cid,
            assistantMessageId,
            runId: turnRunId || randomUUID(),
            content: safePartial,
            status: "done",
            malvTurnOutcome: "partial_done",
            meta: { malvStreamPartialError: e instanceof Error ? e.message : String(e) },
            source: "malv_ws_partial_after_error"
          });
        } catch (persistErr) {
          this.logger.error(
            `[MALV CHAT WS] partial finalize failed userId=${userId} detail=${JSON.stringify(formatErrorForLog(persistErr))}`
          );
        }
        return;
      }
      this.emitToUser(userId, "chat:error", {
        message: MALV_CHAT_AGENT_UNAVAILABLE_USER_MESSAGE,
        code: "failed_before_output"
      });
    }
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    const room = `user:${userId}`;
    this.server.to(room).emit(event, payload);
  }

  /** Authenticated sockets only — used for truthful browser_agent capability. */
  liveAuthenticatedSocketCountForUser(userId: string): number {
    if (!userId || !this.server?.sockets?.sockets) return 0;
    let n = 0;
    for (const [socketId, uid] of this.socketsToUser.entries()) {
      if (uid !== userId) continue;
      const sock = this.server.sockets.sockets.get(socketId);
      if (sock?.connected) n += 1;
    }
    return n;
  }

  @SubscribeMessage("malv:executor_heartbeat")
  async onExecutorHeartbeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channel?: string; deviceId?: string | null }
  ) {
    const auth = await this.requireMutatingSocketUser(client);
    if (!auth.ok) return { ok: false, error: auth.error };
    const ch = typeof body?.channel === "string" && isExecutorChannel(body.channel) ? body.channel : null;
    if (!ch) return { ok: false, error: "invalid_channel" };
    const rawDev = body?.deviceId;
    const deviceId =
      typeof rawDev === "string" && rawDev.trim().length > 0
        ? rawDev.trim().slice(0, 128)
        : rawDev === null
          ? null
          : undefined;
    await this.executorEnrollment?.touchHeartbeat(auth.userId, ch as MalvExecutorEnrollmentChannel, { deviceId });
    return { ok: true, at: Date.now() };
  }

  /** Normalized MALV brain events for web clients (transport-agnostic contract). */
  emitMalvOrchestration(userId: string, payload: Record<string, unknown>) {
    this.logger.log(`[MALV CHAT] malv:orchestration emit userId=${userId} type=${String(payload.type)}`);
    this.emitToUser(userId, "malv:orchestration", payload);
    this.emitPhasedProgressIfPresent(userId, payload);
  }

  /**
   * Truthful WS continuity for deep runs: mirrors server phase transitions that already happened.
   * This does not invent token streaming; it only projects explicit orchestration milestones.
   */
  private emitPhasedProgressIfPresent(userId: string, payload: Record<string, unknown>) {
    if (!malvWsPhaseProgressEnabled((k) => process.env[k])) return;
    if (payload.type !== "thinking") return;
    const rawPhase = typeof payload.phase === "string" ? payload.phase.trim() : "";
    if (!rawPhase.startsWith("server_phase:")) return;
    const phaseId = rawPhase.slice("server_phase:".length).trim();
    if (!phaseId) return;
    const detail = typeof payload.detail === "string" ? payload.detail : "";
    const match = detail.match(/(\d+)\s*\/\s*(\d+)/);
    const phaseIndex = match ? Math.max(0, Number(match[1]) - 1) : null;
    const phaseTotal = match ? Math.max(1, Number(match[2])) : null;
    const status = typeof payload.status === "string" ? payload.status : detail.startsWith("completed") ? "completed" : "in_progress";
    this.emitToUser(userId, "malv:phase_progress", {
      type: "phase_progress",
      conversationId: payload.conversationId ?? null,
      messageId: payload.messageId ?? null,
      phaseId,
      phaseIndex,
      phaseTotal,
      status,
      producer: payload.producer ?? null,
      replyChars: typeof payload.replyChars === "number" ? payload.replyChars : null
    });
  }

  emitToSupportTicket(ticketId: string, event: string, payload: unknown) {
    this.server.to(`ticket:${ticketId}`).emit(event, payload);
  }

  emitToCallSession(callSessionId: string, event: string, payload: unknown) {
    this.server.to(`call:${callSessionId}`).emit(event, payload);
  }

  emitToRoom(roomId: string, event: string, payload: unknown) {
    this.server.to(`room:${roomId}`).emit(event, payload);
  }

  emitToStudioSession(sessionId: string, event: string, payload: unknown) {
    this.server.to(`studio:${sessionId}`).emit(event, payload);
  }

  evictUserFromRoom(roomId: string, userId: string) {
    const roomName = `room:${roomId}`;
    for (const [socketId, uid] of this.socketsToUser.entries()) {
      if (uid !== userId) continue;
      const sock = this.server.sockets.sockets.get(socketId);
      if (!sock) continue;
      sock.leave(roomName);
      this.detachRoomPresence({ roomId, userId, socketId });
      const joined = this.socketCollabRooms.get(socketId);
      if (joined) {
        joined.delete(roomId);
        if (joined.size === 0) this.socketCollabRooms.delete(socketId);
      }
    }
  }

  evictRoom(roomId: string) {
    const roomName = `room:${roomId}`;
    for (const [socketId, joined] of this.socketCollabRooms.entries()) {
      if (!joined.has(roomId)) continue;
      const userId = this.socketsToUser.get(socketId);
      const sock = this.server.sockets.sockets.get(socketId);
      sock?.leave(roomName);
      if (userId) this.detachRoomPresence({ roomId, userId, socketId });
      joined.delete(roomId);
      if (joined.size === 0) this.socketCollabRooms.delete(socketId);
    }
  }

  private attachRoomPresence(args: { roomId: string; userId: string; socketId: string }) {
    const byUser = this.roomPresence.get(args.roomId) ?? new Map<string, Set<string>>();
    const sockets = byUser.get(args.userId) ?? new Set<string>();
    sockets.add(args.socketId);
    byUser.set(args.userId, sockets);
    this.roomPresence.set(args.roomId, byUser);
    this.touchRoomActivity(args.roomId, args.userId);
    this.emitRoomPresence(args.roomId);
  }

  private detachRoomPresence(args: { roomId: string; userId: string; socketId: string }) {
    const byUser = this.roomPresence.get(args.roomId);
    if (!byUser) return;
    const sockets = byUser.get(args.userId);
    if (sockets) {
      sockets.delete(args.socketId);
      if (sockets.size === 0) {
        byUser.delete(args.userId);
      } else {
        byUser.set(args.userId, sockets);
      }
    }
    if (byUser.size === 0) this.roomPresence.delete(args.roomId);
    else this.roomPresence.set(args.roomId, byUser);
    this.emitRoomPresence(args.roomId);
  }

  private touchRoomActivity(roomId: string, userId: string) {
    const active = this.roomLastActiveAt.get(roomId) ?? new Map<string, number>();
    active.set(userId, Date.now());
    this.roomLastActiveAt.set(roomId, active);
  }

  private emitRoomPresence(roomId: string) {
    const activeWindowMs = Number(process.env.ROOM_ACTIVE_WINDOW_MS ?? 45_000);
    const byUser = this.roomPresence.get(roomId) ?? new Map<string, Set<string>>();
    const activeMap = this.roomLastActiveAt.get(roomId) ?? new Map<string, number>();
    const now = Date.now();
    for (const [uid, at] of Array.from(activeMap.entries())) {
      if (now - at > activeWindowMs * 3) {
        activeMap.delete(uid);
      }
    }
    this.roomLastActiveAt.set(roomId, activeMap);
    const onlineUsers = Array.from(byUser.keys());
    const activeUsers = onlineUsers.filter((uid) => now - (activeMap.get(uid) ?? 0) <= activeWindowMs);
    this.emitToRoom(roomId, "room:presence", {
      roomId,
      onlineUsers,
      activeUsers,
      onlineCount: onlineUsers.length,
      activeCount: activeUsers.length,
      at: now
    });
  }
}

