import { MALV_IDENTITY_POLICY } from "../beast/malv-identity-policy";
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
      { isCancelled: jest.fn().mockReturnValue(false) } as any,
      calls,
      { replayForSession: jest.fn(() => []) } as any,
      { assertMember: jest.fn() } as any,
      {} as any,
      {} as any,
      rateLimit,
      dataSource,
      { incAuthFailure: jest.fn(), incWebsocketDisconnect: jest.fn() } as any,
      { startTurn: jest.fn(), markFirstVisibleOutput: jest.fn(), completeTurn: jest.fn() } as any,
      { internalUsersOnlyMode: () => false, internalUserAllowlist: () => [], userInRollout: () => true } as any
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

  it("includes decision snapshot on assistant_done websocket event", async () => {
    const { gateway } = buildGateway();
    const roomEmit = jest.fn();
    (gateway as any).server = { to: jest.fn().mockReturnValue({ emit: roomEmit }) };
    (gateway as any).chat = {
      handleChat: jest.fn().mockResolvedValue({
        conversationId: "c1",
        assistantMessageId: "a1",
        runId: "r1",
        reply: "hello",
        interrupted: false,
        deferAssistantPersist: false,
        meta: {
          malvReplySource: "beast_worker",
          malvTurnOutcome: "complete",
          malvExecutionStrategy: { mode: "single_step" },
          malvInferenceTrace: {
            malvChatInferenceTransport: "beast_worker",
            malvRouting: { malvSelectedTier: "tier_1" }
          },
          malvStructuredRichSurface: true,
          malvRichResponse: {
            sources: [{ title: "Doc", url: "https://example.com/a" }],
            showSourcesInChrome: true
          }
        }
      }),
      finalizeAssistantTurn: jest.fn()
    };
    await (gateway as any).runChatSendPipelineAfterAck({
      userId: "u1",
      client: { data: { role: "user" } },
      payload: { message: "hello", conversationId: null },
      assistantMessageId: "a1",
      abortController: new AbortController()
    });
    const orchestrationEvt = roomEmit.mock.calls
      .filter((c: unknown[]) => c[0] === "malv:orchestration")
      .map((c) => c[1])
      .find((evt: any) => evt?.type === "assistant_done") as
      | { decisionSnapshot?: Record<string, unknown>; assistantMeta?: Record<string, unknown> }
      | undefined;
    expect(orchestrationEvt?.decisionSnapshot).toMatchObject({
      replySource: "beast_worker",
      selectedTier: "tier_1",
      executionMode: "single_step"
    });
    expect(orchestrationEvt?.assistantMeta).toEqual({
      malvStructuredRichSurface: true,
      malvRichResponse: {
        sources: [{ title: "Doc", url: "https://example.com/a" }],
        showSourcesInChrome: true
      }
    });
    expect(orchestrationEvt?.assistantMeta).not.toHaveProperty("malvInferenceTrace");
  });

  it("preserves deterministic chunk ordering and completion under async cancellation checks", async () => {
    const { gateway } = buildGateway();
    const roomEmit = jest.fn();
    (gateway as any).server = { to: jest.fn().mockReturnValue({ emit: roomEmit }) };
    (gateway as any).chatRuns = {
      isCancelled: jest
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<boolean>((resolve) => {
              setTimeout(() => resolve(false), 25);
            })
        )
        .mockImplementationOnce(
          () =>
            new Promise<boolean>((resolve) => {
              setTimeout(() => resolve(false), 1);
            })
        )
        .mockImplementationOnce(
          () =>
            new Promise<boolean>((resolve) => {
              setTimeout(() => resolve(false), 5);
            })
        )
    };
    (gateway as any).chat = {
      handleChat: jest.fn(async (args: { onAssistantStreamChunk?: (evt: any) => Promise<void> }) => {
        await args.onAssistantStreamChunk?.({ conversationId: "c1", runId: "r1", text: "A" });
        await args.onAssistantStreamChunk?.({ conversationId: "c1", runId: "r1", text: "B" });
        await args.onAssistantStreamChunk?.({ conversationId: "c1", runId: "r1", text: "C" });
        return {
          conversationId: "c1",
          assistantMessageId: "a1",
          runId: "r1",
          reply: "ABC",
          interrupted: false,
          deferAssistantPersist: false,
          meta: { malvTurnOutcome: "complete", malvReplySource: "beast_worker" }
        };
      }),
      finalizeAssistantTurn: jest.fn()
    };
    await (gateway as any).runChatSendPipelineAfterAck({
      userId: "u1",
      client: { data: { role: "user" } },
      payload: { message: "hello", conversationId: null },
      assistantMessageId: "a1",
      abortController: new AbortController()
    });
    const chunkEvents = roomEmit.mock.calls.filter((c: unknown[]) => c[0] === "chat:reply_chunk").map((c) => c[1]);
    expect(chunkEvents).toHaveLength(3);
    expect(chunkEvents.map((e: any) => e.index)).toEqual([0, 1, 2]);
    expect(chunkEvents.map((e: any) => e.text).join("")).toBe("ABC");
    const doneEvent = roomEmit.mock.calls
      .filter((c: unknown[]) => c[0] === "malv:orchestration")
      .map((c) => c[1])
      .find((evt: any) => evt.type === "assistant_done");
    expect(doneEvent).toMatchObject({
      conversationId: "c1",
      messageId: "a1",
      finalContent: "ABC"
    });
  });

  it("assistant_done finalContent is derived from stream accumulation (stream-first canonical contract)", async () => {
    const { gateway } = buildGateway();
    const roomEmit = jest.fn();
    (gateway as any).server = { to: jest.fn().mockReturnValue({ emit: roomEmit }) };
    (gateway as any).chat = {
      handleChat: jest.fn(async (args: { onAssistantStreamChunk?: (evt: any) => Promise<void> }) => {
        await args.onAssistantStreamChunk?.({ conversationId: "c1", runId: "r1", text: "RAW" });
        return {
          conversationId: "c1",
          assistantMessageId: "a1",
          runId: "r1",
          reply: "CANONICAL_DELIVERY",
          interrupted: false,
          deferAssistantPersist: false,
          meta: { malvTurnOutcome: "complete", malvReplySource: "beast_worker" }
        };
      }),
      finalizeAssistantTurn: jest.fn()
    };
    await (gateway as any).runChatSendPipelineAfterAck({
      userId: "u1",
      client: { data: { role: "user" } },
      payload: { message: "hello", conversationId: null },
      assistantMessageId: "a1",
      abortController: new AbortController()
    });
    const chunks = roomEmit.mock.calls.filter((c: unknown[]) => c[0] === "chat:reply_chunk").map((c) => c[1]);
    expect(chunks.map((e: any) => e.text).join("")).toBe("RAW");
    const doneEvent = roomEmit.mock.calls
      .filter((c: unknown[]) => c[0] === "malv:orchestration")
      .map((c) => c[1])
      .find((evt: any) => evt.type === "assistant_done");
    // Stream-first contract: finalContent is derived from stream accumulation (what user watched),
    // not the orchestrator reply. "RAW" is the stream accumulation; after safe finalization it
    // passes through unchanged (no identity issues, no hollow openers to strip).
    expect(doneEvent.finalContent).toBe("RAW");
  });

  it("classifies non-stop finish reasons as partial_done in WS assistant_done", async () => {
    const { gateway } = buildGateway();
    const roomEmit = jest.fn();
    (gateway as any).server = { to: jest.fn().mockReturnValue({ emit: roomEmit }) };
    (gateway as any).chat = {
      handleChat: jest.fn().mockResolvedValue({
        conversationId: "c1",
        assistantMessageId: "a1",
        runId: "r1",
        reply: "truncated",
        interrupted: false,
        deferAssistantPersist: false,
        meta: {
          malvTurnOutcome: "complete",
          malvReplySource: "beast_worker",
          malvLastFinishReason: "length"
        }
      }),
      finalizeAssistantTurn: jest.fn()
    };
    await (gateway as any).runChatSendPipelineAfterAck({
      userId: "u1",
      client: { data: { role: "user" } },
      payload: { message: "hello", conversationId: null },
      assistantMessageId: "a1",
      abortController: new AbortController()
    });
    const doneEvent = roomEmit.mock.calls
      .filter((c: unknown[]) => c[0] === "malv:orchestration")
      .map((c) => c[1])
      .find((evt: any) => evt.type === "assistant_done");
    expect(doneEvent).toMatchObject({
      conversationId: "c1",
      messageId: "a1",
      malvTurnOutcome: "partial_done"
    });
  });

  it("marks interrupted turns as partial_done instead of complete", async () => {
    const { gateway } = buildGateway();
    const roomEmit = jest.fn();
    (gateway as any).server = { to: jest.fn().mockReturnValue({ emit: roomEmit }) };
    (gateway as any).chat = {
      handleChat: jest.fn().mockResolvedValue({
        conversationId: "c1",
        assistantMessageId: "a1",
        runId: "r1",
        reply: "stopped early",
        interrupted: true,
        deferAssistantPersist: false,
        meta: {
          malvTurnOutcome: "complete",
          malvReplySource: "interrupted"
        }
      }),
      finalizeAssistantTurn: jest.fn()
    };
    await (gateway as any).runChatSendPipelineAfterAck({
      userId: "u1",
      client: { data: { role: "user" } },
      payload: { message: "hello", conversationId: null },
      assistantMessageId: "a1",
      abortController: new AbortController()
    });
    const doneEvent = roomEmit.mock.calls
      .filter((c: unknown[]) => c[0] === "malv:orchestration")
      .map((c) => c[1])
      .find((evt: any) => evt.type === "assistant_done");
    expect(doneEvent).toMatchObject({
      conversationId: "c1",
      messageId: "a1",
      terminal: "interrupted",
      malvTurnOutcome: "partial_done"
    });
  });

  it("sanitizes partial_done final content before WS emit and persistence", async () => {
    const { gateway } = buildGateway();
    const roomEmit = jest.fn();
    (gateway as any).server = { to: jest.fn().mockReturnValue({ emit: roomEmit }) };
    const finalizeAssistantTurn = jest.fn().mockResolvedValue(undefined);
    (gateway as any).chat = {
      handleChat: jest.fn(async (args: { onAssistantStreamChunk?: (evt: any) => Promise<void> }) => {
        await args.onAssistantStreamChunk?.({
          conversationId: "c1",
          runId: "r1",
          text: "I'm Qwen from Alibaba Cloud."
        });
        throw new Error("stream_failed_after_output");
      }),
      finalizeAssistantTurn
    };
    await (gateway as any).runChatSendPipelineAfterAck({
      userId: "u1",
      client: { data: { role: "user" } },
      payload: { message: "hello", conversationId: null },
      assistantMessageId: "a1",
      abortController: new AbortController()
    });
    const doneEvent = roomEmit.mock.calls
      .filter((c: unknown[]) => c[0] === "malv:orchestration")
      .map((c) => c[1])
      .find((evt: any) => evt.type === "assistant_done");
    expect(doneEvent.finalContent).toContain("MALV");
    expect(String(doneEvent.finalContent).toLowerCase()).not.toContain("qwen");
    expect(String(doneEvent.finalContent).toLowerCase()).not.toContain("alibaba");
    expect(finalizeAssistantTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("MALV"),
        malvTurnOutcome: "partial_done"
      })
    );
  });

  it("partial_done path replaces implicit origin narration with the strict identity line", async () => {
    const { gateway } = buildGateway();
    const roomEmit = jest.fn();
    (gateway as any).server = { to: jest.fn().mockReturnValue({ emit: roomEmit }) };
    const finalizeAssistantTurn = jest.fn().mockResolvedValue(undefined);
    (gateway as any).chat = {
      handleChat: jest.fn(async (args: { onAssistantStreamChunk?: (evt: any) => Promise<void> }) => {
        await args.onAssistantStreamChunk?.({
          conversationId: "c1",
          runId: "r1",
          text: "I was developed through a collaborative effort across several teams."
        });
        throw new Error("stream_failed_after_output");
      }),
      finalizeAssistantTurn
    };
    await (gateway as any).runChatSendPipelineAfterAck({
      userId: "u1",
      client: { data: { role: "user" } },
      payload: { message: "hello", conversationId: null },
      assistantMessageId: "a1",
      abortController: new AbortController()
    });
    const doneEvent = roomEmit.mock.calls
      .filter((c: unknown[]) => c[0] === "malv:orchestration")
      .map((c: unknown[]) => c[1])
      .find((evt: any) => evt.type === "assistant_done") as { type: string; finalContent?: string } | undefined;
    expect(doneEvent?.finalContent).toBe(MALV_IDENTITY_POLICY.strictNoOriginDetailsResponse);
    expect(finalizeAssistantTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        content: MALV_IDENTITY_POLICY.strictNoOriginDetailsResponse,
        malvTurnOutcome: "partial_done"
      })
    );
  });

  it("partial_done path replaces leaky creator-disclaimer streaming accum with the strict identity line", async () => {
    const { gateway } = buildGateway();
    const roomEmit = jest.fn();
    (gateway as any).server = { to: jest.fn().mockReturnValue({ emit: roomEmit }) };
    const finalizeAssistantTurn = jest.fn().mockResolvedValue(undefined);
    (gateway as any).chat = {
      handleChat: jest.fn(async (args: { onAssistantStreamChunk?: (evt: any) => Promise<void> }) => {
        await args.onAssistantStreamChunk?.({
          conversationId: "c1",
          runId: "r1",
          text: "I don't have specific information about my creator. I can help with your task."
        });
        throw new Error("stream_failed_after_output");
      }),
      finalizeAssistantTurn
    };
    await (gateway as any).runChatSendPipelineAfterAck({
      userId: "u1",
      client: { data: { role: "user" } },
      payload: { message: "hello", conversationId: null },
      assistantMessageId: "a1",
      abortController: new AbortController()
    });
    const doneEvent = roomEmit.mock.calls
      .filter((c: unknown[]) => c[0] === "malv:orchestration")
      .map((c: unknown[]) => c[1])
      .find((evt: any) => evt.type === "assistant_done") as { type: string; finalContent?: string } | undefined;
    expect(doneEvent?.finalContent).toBe(MALV_IDENTITY_POLICY.strictNoOriginDetailsResponse);
    expect(finalizeAssistantTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        content: MALV_IDENTITY_POLICY.strictNoOriginDetailsResponse,
        malvTurnOutcome: "partial_done"
      })
    );
  });

  it("emits truthful phase_progress markers from server phased orchestration thinking events", () => {
    const { gateway } = buildGateway();
    const roomEmit = jest.fn();
    (gateway as any).server = { to: jest.fn().mockReturnValue({ emit: roomEmit }) };

    gateway.emitMalvOrchestration("u1", {
      type: "thinking",
      conversationId: "c1",
      messageId: "a1",
      phase: "server_phase:audit",
      detail: "step 1/3"
    });
    gateway.emitMalvOrchestration("u1", {
      type: "thinking",
      conversationId: "c1",
      messageId: "a1",
      phase: "server_phase:audit",
      detail: "completed 1/3",
      status: "completed",
      producer: "beast_worker",
      replyChars: 120
    });

    const phaseEvents = roomEmit.mock.calls.filter((c: unknown[]) => c[0] === "malv:phase_progress");
    expect(phaseEvents).toHaveLength(2);
    expect(phaseEvents[0]?.[1]).toMatchObject({
      type: "phase_progress",
      phaseId: "audit",
      phaseIndex: 0,
      phaseTotal: 3,
      status: "in_progress"
    });
    expect(phaseEvents[1]?.[1]).toMatchObject({
      type: "phase_progress",
      phaseId: "audit",
      phaseIndex: 0,
      phaseTotal: 3,
      status: "completed",
      producer: "beast_worker",
      replyChars: 120
    });
  });

  it("counts executor targets by bridge/device room", () => {
    const { gateway } = buildGateway();
    const emit = jest.fn();
    (gateway as any).server = {
      sockets: {
        adapter: {
          rooms: new Map<string, Set<string>>([
            ["malv_exec:u1:desktop", new Set(["sock-a", "sock-b"])],
            ["malv_exec:u1:desktop:dev-1", new Set(["sock-a"])],
            ["malv_exec:u1:mobile:dev-9", new Set(["sock-z"])]
          ])
        }
      },
      to: jest.fn().mockReturnValue({ emit })
    };
    expect(gateway.countExecutorDispatchTargets("u1", "desktop_agent", null)).toBe(2);
    expect(gateway.countExecutorDispatchTargets("u1", "desktop_agent", "dev-1")).toBe(1);
    expect(gateway.countExecutorDispatchTargets("u1", "desktop_agent", "dev-missing")).toBe(0);
  });

  it("emits external dispatch only to targeted executor room", () => {
    const { gateway } = buildGateway();
    const roomEmit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit: roomEmit });
    (gateway as any).server = {
      sockets: {
        adapter: {
          rooms: new Map<string, Set<string>>([
            ["malv_exec:u1:desktop:dev-1", new Set(["sock-a"])]
          ])
        }
      },
      to
    };
    const sent = gateway.emitExternalActionDispatch(
      "u1",
      "desktop_agent",
      "dev-1",
      "malv:external_action_dispatch",
      { dispatchId: "d1" }
    );
    expect(sent).toBe(1);
    expect(to).toHaveBeenCalledWith("malv_exec:u1:desktop:dev-1");
    expect(roomEmit).toHaveBeenCalledWith("malv:external_action_dispatch", { dispatchId: "d1" });
  });
});
