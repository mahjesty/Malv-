import { RealtimeGateway } from "./realtime.gateway";
import { UserEntity } from "../db/entities/user.entity";
import { SupportTicketEntity } from "../db/entities/support-ticket.entity";
import { MalvStudioSessionEntity } from "../db/entities/malv-studio-session.entity";

describe("RealtimeGateway authz hardening", () => {
  function buildGateway() {
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: "u1",
        isActive: true,
        updatedAt: new Date(Date.now() - 10_000)
      })
    };
    const ticketRepo = {
      findOne: jest.fn()
    };
    const studioSessionRepo = {
      findOne: jest.fn()
    };
    const dataSource: any = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === UserEntity) return userRepo;
        if (entity === SupportTicketEntity) return ticketRepo;
        if (entity === MalvStudioSessionEntity) return studioSessionRepo;
        return { findOne: jest.fn() };
      })
    };
    const calls: any = {
      assertUserOwnsCall: jest.fn().mockResolvedValue({}),
      joinCall: jest.fn(),
      beginVoiceOnboardingIfNeeded: jest.fn(),
      getCall: jest.fn().mockResolvedValue({ runtime: {} })
    };
    const rateLimit: any = {
      check: jest.fn().mockResolvedValue({ allowed: true, remaining: 1, resetAt: Date.now() + 60_000 }),
      recordHit: jest.fn()
    };
    const gateway = new RealtimeGateway(
      { verifyAsync: jest.fn() } as any,
      {} as any,
      {} as any,
      calls,
      { replayForSession: jest.fn(() => []) } as any,
      { assertMember: jest.fn() } as any,
      {} as any,
      {} as any,
      rateLimit,
      dataSource,
      { incAuthFailure: jest.fn(), incWebsocketDisconnect: jest.fn() } as any
    );
    (gateway as any).socketsToUser.set("sock1", "u1");
    return { gateway, ticketRepo, calls, studioSessionRepo };
  }

  it("blocks support ticket join when ticket is not owned", async () => {
    const { gateway, ticketRepo } = buildGateway();
    ticketRepo.findOne.mockResolvedValue(null);
    const client: any = { id: "sock1", data: { iatSec: Math.floor(Date.now() / 1000) }, join: jest.fn(), emit: jest.fn(), disconnect: jest.fn() };
    const out = await gateway.onSupportJoin({ ticketId: "t1" }, client);
    expect(out.ok).toBe(false);
    expect(client.join).not.toHaveBeenCalled();
  });

  it("blocks call signal when socket has not joined room", async () => {
    const { gateway, calls } = buildGateway();
    const client: any = {
      id: "sock1",
      data: { iatSec: Math.floor(Date.now() / 1000) },
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      disconnect: jest.fn()
    };
    const out = await gateway.onCallSignal({ callSessionId: "c1", kind: "offer", sdp: "x" }, client);
    expect(calls.assertUserOwnsCall).toHaveBeenCalledWith({ userId: "u1", callSessionId: "c1" });
    expect(out.ok).toBe(false);
  });

  it("disconnects stale websocket auth before joining call room", async () => {
    const { gateway } = buildGateway();
    const client: any = {
      id: "sock1",
      data: { iatSec: 1 },
      disconnect: jest.fn(),
      join: jest.fn()
    };
    const out = await gateway.onCallJoin({ callSessionId: "c1" }, client);
    expect(out.ok).toBe(false);
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it("blocks studio room join when session is not owned", async () => {
    const { gateway, studioSessionRepo } = buildGateway();
    studioSessionRepo.findOne.mockResolvedValue(null);
    const client: any = {
      id: "sock1",
      data: { iatSec: Math.floor(Date.now() / 1000) },
      join: jest.fn(),
      disconnect: jest.fn()
    };
    const out = await gateway.onStudioJoin({ sessionId: "studio1" }, client);
    expect(out.ok).toBe(false);
    expect(client.join).not.toHaveBeenCalled();
  });

  it("replays studio events on successful session join", async () => {
    const { gateway, studioSessionRepo } = buildGateway();
    studioSessionRepo.findOne.mockResolvedValue({ id: "studio1", user: { id: "u1" } });
    (gateway as any).studioStream = {
      replayForSession: jest.fn(() => [{ sessionId: "studio1", at: 1, type: "console_event", payload: { message: "x" } }])
    };
    const client: any = {
      id: "sock1",
      data: { iatSec: Math.floor(Date.now() / 1000) },
      join: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn()
    };
    const out = await gateway.onStudioJoin({ sessionId: "studio1" }, client);
    expect(out.ok).toBe(true);
    expect(client.emit).toHaveBeenCalledWith(
      "studio:runtime_replay",
      expect.objectContaining({ sessionId: "studio1", events: expect.any(Array) })
    );
  });
});
