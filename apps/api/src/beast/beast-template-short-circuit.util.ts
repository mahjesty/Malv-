import { appendBeastSuggestionBlock, detectBeastSignal } from "./beast-signal";
import type { MalvReflexKind } from "./malv-reflex-turn.util";
import type { UserToneAnalysis } from "./malv-conversation-signals";
import { finalizeAssistantOutputWithMeta } from "./malv-finalize-assistant-output.util";
import { buildMalvGeneratorContext, generateMalvResponse } from "./malv-response-generator";

export type DeterministicTemplateShortCircuitResult = {
  reply: string;
  malvReplySource: string;
  malvRepetitionGuardTriggered: boolean;
  malvHadModelIdentityLeak: boolean;
  beastSignalReason: string | null;
};

/**
 * Shared deterministic template path for the Tier-0 reflex lane (and any future callers that must stay aligned).
 * Preserves shaping, beast-signal append, and repetition guard behavior.
 */
export function buildDeterministicTemplateShortCircuit(args: {
  reflexKind: MalvReflexKind;
  userMessage: string;
  priorMessages: ReadonlyArray<{ role: string; content: string }>;
  priorAssistantTexts: string[];
  conversationId: string;
  toneAnalysis: UserToneAnalysis;
  isFirstThreadTurn: boolean;
}): DeterministicTemplateShortCircuitResult {
  const beastSigEarly = detectBeastSignal({
    userMessage: args.userMessage,
    priorMessages: args.priorMessages as { role: string; content: string }[]
  });
  const beastSignalReason = beastSigEarly.reason ?? null;

  const ctx =
    args.reflexKind.kind === "light_social"
      ? buildMalvGeneratorContext({
          userMessage: args.userMessage,
          conversationHistory: args.priorMessages,
          conversationId: args.conversationId,
          userTone: args.toneAnalysis.userTone,
          toneReasons: args.toneAnalysis.toneReasons,
          isFirstThreadTurn: args.isFirstThreadTurn,
          isGreeting: false,
          detectedIntent: "light_social",
          lightSocialKind: args.reflexKind.lightSocialKind
        })
      : args.reflexKind.kind === "greeting"
        ? buildMalvGeneratorContext({
            userMessage: args.userMessage,
            conversationHistory: args.priorMessages,
            conversationId: args.conversationId,
            userTone: args.toneAnalysis.userTone,
            toneReasons: args.toneAnalysis.toneReasons,
            isFirstThreadTurn: args.isFirstThreadTurn,
            isGreeting: true,
            detectedIntent: "greeting"
          })
        : args.reflexKind.kind === "identity"
          ? buildMalvGeneratorContext({
              userMessage: args.userMessage,
              conversationHistory: args.priorMessages,
              conversationId: args.conversationId,
              userTone: args.toneAnalysis.userTone,
              toneReasons: args.toneAnalysis.toneReasons,
              isFirstThreadTurn: args.isFirstThreadTurn,
              isGreeting: false,
              detectedIntent: "identity_question",
              identityKind: args.reflexKind.identityKind
            })
          : buildMalvGeneratorContext({
              userMessage: args.userMessage,
              conversationHistory: args.priorMessages,
              conversationId: args.conversationId,
              userTone: args.toneAnalysis.userTone,
              toneReasons: args.toneAnalysis.toneReasons,
              isFirstThreadTurn: args.isFirstThreadTurn,
              isGreeting: false,
              detectedIntent: "social_smalltalk_checkin"
            });

  const bundle = finalizeAssistantOutputWithMeta(generateMalvResponse(ctx), {
    priorAssistantTexts: args.priorAssistantTexts
  });

  const malvReplySource =
    args.reflexKind.kind === "light_social"
      ? "malv_light_social_short_circuit"
      : args.reflexKind.kind === "greeting"
        ? "malv_greeting_short_circuit"
        : args.reflexKind.kind === "identity"
          ? "malv_identity_short_circuit"
          : "malv_casual_small_talk_short_circuit";

  return {
    reply: appendBeastSuggestionBlock(bundle.text, beastSigEarly.suggestion),
    malvReplySource,
    malvRepetitionGuardTriggered: bundle.repetitionGuardTriggered,
    malvHadModelIdentityLeak: bundle.hadModelIdentityLeak,
    beastSignalReason
  };
}
