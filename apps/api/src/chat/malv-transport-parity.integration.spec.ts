import { ConfigService } from "@nestjs/config";
import { ChatController } from "./chat.controller";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { UserEntity } from "../db/entities/user.entity";
import { SupportTicketEntity } from "../db/entities/support-ticket.entity";
import { MalvStudioSessionEntity } from "../db/entities/malv-studio-session.entity";
import { buildMalvTransportDecisionSnapshot } from "./malv-transport-parity.util";

type StubChatResult = {
  reply: string;
  conversationId: string;
  runId: string;
  assistantMessageId: string;
  interrupted?: boolean;
  deferAssistantPersist?: boolean;
  meta: Record<string, unknown>;
};

function makeGateway(chatResult: StubChatResult) {
  const chat = {
    handleChat: jest.fn().mockResolvedValue(chatResult),
    finalizeAssistantTurn: jest.fn().mockResolvedValue(undefined)
  };
  const userRepo = {
    findOne: jest.fn().mockResolvedValue({
      id: "u1",
      isActive: true,
      updatedAt: new Date(Date.now() - 10_000)
    })
  };
  const dataSource: any = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === UserEntity) return userRepo;
      if (entity === SupportTicketEntity || entity === MalvStudioSessionEntity) return { findOne: jest.fn() };
      return { findOne: jest.fn() };
    })
  };
  const gateway = new RealtimeGateway(
    { verifyAsync: jest.fn() } as any,
    chat as any,
    { isCancelled: jest.fn().mockReturnValue(false) } as any,
    {} as any,
    { replayForSession: jest.fn(() => []) } as any,
    {} as any,
    {} as any,
    {} as any,
    { check: jest.fn(), recordHit: jest.fn() } as any,
    dataSource,
    { incAuthFailure: jest.fn(), incWebsocketDisconnect: jest.fn() } as any,
    { startTurn: jest.fn(), markFirstVisibleOutput: jest.fn(), completeTurn: jest.fn() } as any,
    { internalUsersOnlyMode: () => false, internalUserAllowlist: () => [], userInRollout: () => true } as any
  );
  const emit = jest.fn();
  (gateway as any).server = { to: jest.fn().mockReturnValue({ emit }) };
  return { gateway, chat, emit };
}

describe("MALV transport parity harness", () => {
  const promptClasses = [
    {
      kind: "reflex_simple",
      result: {
        reply: "Thanks!",
        conversationId: "c-1",
        runId: "r-1",
        assistantMessageId: "a-1",
        meta: {
          malvReplySource: "malv_light_social_short_circuit",
          malvTurnOutcome: "complete",
          malvExecutionStrategy: { mode: "single_step" },
          malvInferenceTrace: {
            malvChatInferenceTransport: "reflex_template",
            malvLearningSignalsCaptured: false,
            malvRouting: { malvSelectedTier: "tier_0_reflex" }
          }
        }
      }
    },
    {
      kind: "normal_question",
      result: {
        reply: "Here is the answer.",
        conversationId: "c-2",
        runId: "r-2",
        assistantMessageId: "a-2",
        meta: {
          malvReplySource: "beast_worker",
          malvTurnOutcome: "complete",
          malvExecutionStrategy: { mode: "single_step" },
          malvInferenceTrace: {
            malvChatInferenceTransport: "beast_worker",
            malvLearningSignalsCaptured: true,
            malvRouting: { malvSelectedTier: "tier_1" }
          }
        }
      }
    },
    {
      kind: "deep_engineering",
      result: {
        reply: "## Audit\n...\n## Plan\n...",
        conversationId: "c-3",
        runId: "r-3",
        assistantMessageId: "a-3",
        meta: {
          malvReplySource: "beast_worker_phased",
          malvTurnOutcome: "complete",
          malvServerPhasedOrchestration: true,
          malvExecutionStrategy: { mode: "phased" },
          malvInferenceTrace: {
            malvChatInferenceTransport: "beast_worker_phased",
            malvLearningSignalsCaptured: true,
            malvServerPhasedOrchestrationEnabled: true,
            malvRouting: { malvSelectedTier: "tier_2" }
          }
        }
      }
    },
    {
      kind: "clarification_ambiguous",
      result: {
        reply: "Could you clarify X or Y?",
        conversationId: "c-4",
        runId: "r-4",
        assistantMessageId: "a-4",
        meta: {
          malvReplySource: "malv_confidence_clarification",
          malvConfidenceClarification: true,
          malvTurnOutcome: "complete",
          malvExecutionStrategy: { mode: "require_clarification" },
          malvInferenceTrace: {
            malvChatInferenceTransport: "non_worker_clarification",
            malvLearningSignalsCaptured: true,
            malvRouting: { malvSelectedTier: "tier_1" }
          }
        }
      }
    },
    {
      kind: "learning_enabled_ordinary",
      result: {
        reply: "Done.",
        conversationId: "c-5",
        runId: "r-5",
        assistantMessageId: "a-5",
        meta: {
          malvReplySource: "beast_worker",
          malvTurnOutcome: "complete",
          malvExecutionStrategy: { mode: "single_step" },
          malvInferenceTrace: {
            malvChatInferenceTransport: "beast_worker",
            malvLearningSignalsCaptured: true,
            malvRouting: { malvSelectedTier: "tier_1" }
          }
        }
      }
    },
    {
      kind: "policy_block",
      result: {
        reply: "That request is blocked by MALV policy gates for this session.",
        conversationId: "c-6",
        runId: "r-6",
        assistantMessageId: "a-6",
        meta: {
          malvReplySource: "policy_block",
          malvTurnOutcome: "complete",
          policyDenied: true,
          malvExecutionStrategy: { mode: "single_step" },
          malvInferenceTrace: {
            malvChatInferenceTransport: "non_worker_policy_block",
            malvLearningSignalsCaptured: false,
            malvIntentKind: "execute",
            malvRouting: { malvSelectedTier: "tier_1" }
          }
        }
      }
    },
    {
      kind: "interrupted_turn",
      result: {
        reply: "",
        conversationId: "c-7",
        runId: "r-7",
        assistantMessageId: "a-7",
        interrupted: true,
        meta: {
          malvReplySource: "interrupted",
          malvTerminal: "interrupted",
          malvExecutionStrategy: { mode: "single_step" },
          malvInferenceTrace: {
            malvChatInferenceTransport: "non_worker_interrupted",
            malvLearningSignalsCaptured: false,
            malvIntentKind: "answer",
            malvRouting: { malvSelectedTier: "tier_1" }
          }
        }
      }
    }
  ] as const;

  it.each(promptClasses)("keeps core decision parity for $kind", async ({ result }) => {
    const chatService = { handleChat: jest.fn().mockResolvedValue(result) };
    const controller = new ChatController(
      chatService as any,
      {} as any,
      {} as any,
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
      { internalUsersOnlyMode: () => false, internalUserAllowlist: () => [], userInRollout: () => true } as any
    );
    const http = await controller.handleChat(
      { user: { userId: "u1", role: "user" } } as any,
      { message: "x", conversationId: null } as any
    );
    const httpDecision = buildMalvTransportDecisionSnapshot((http as any).meta);

    const { gateway } = makeGateway(result);
    const orchestrationEmit = jest.spyOn(gateway as any, "emitMalvOrchestration");
    await (gateway as any).runChatSendPipelineAfterAck({
      userId: "u1",
      client: { data: { role: "user" } },
      payload: { message: "x", conversationId: null },
      assistantMessageId: result.assistantMessageId,
      abortController: new AbortController()
    });
    const orchestrationEvents = orchestrationEmit.mock.calls as Array<
      [userId: string, event: { type?: string; decisionSnapshot?: unknown }]
    >;
    const assistantDoneEvt = orchestrationEvents.find(([, event]) => event?.type === "assistant_done")?.[1];
    expect(assistantDoneEvt).toBeDefined();
    expect(assistantDoneEvt?.decisionSnapshot).toEqual(httpDecision);
    expect(httpDecision).toMatchObject({
      replySource: expect.anything(),
      executionMode: expect.anything(),
      phasedEnabled: expect.any(Boolean),
      confidenceClarification: expect.any(Boolean),
      requiresClarification: expect.any(Boolean),
      policyDenied: expect.any(Boolean),
      responseRetryTriggered: expect.any(Boolean),
      tierCorrectionApplied: expect.any(Boolean)
    });
  });
});
