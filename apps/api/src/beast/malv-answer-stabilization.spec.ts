import { buildMalvChatPrompt } from "./malv-brain-prompt";
import { classifyMalvReflexTurn } from "./malv-reflex-turn.util";
import { detectLightSocialMessage, detectMalvIdentityQuestion } from "./malv-conversation-signals";
import { enforceMalvFinalReplyIdentityPolicy, malvAssistantTextImpliesOrigin } from "./malv-final-reply-identity-validator";
import { MALV_IDENTITY_POLICY } from "./malv-identity-policy";
import {
  formatUniversalCapabilityRoutingContextBlock,
  resolveMalvUniversalCapabilityRouteForWorkerPrompt,
  resolveUniversalMalvCapabilityRoute
} from "./malv-universal-capability-router.util";
import { composeMalvCapabilityRichDelivery } from "./malv-universal-capability-response-compose.util";
import { classifyMalvQuestionAnswerShape } from "./malv-intent-first-answer-shape.util";
import { shapeMalvReply } from "./response-shaper";

describe("MALV answer stabilization pass", () => {
  describe("identity gate — no false positives on domain vocabulary", () => {
    it("does not treat ordinary factual copy about teams/companies as origin narrative", () => {
      const factual =
        "Delta State’s environmental programs enlist volunteer teams and partner with local companies on river cleanup and waste audits.";
      expect(malvAssistantTextImpliesOrigin(factual)).toBe(false);
      const out = enforceMalvFinalReplyIdentityPolicy(factual, MALV_IDENTITY_POLICY);
      expect(out.mode).toBe("none");
      expect(out.text).toBe(factual);
    });

    it("still replaces genuinely vague assistant self-origin deflection", () => {
      const vague = "I was developed through a collaborative effort spanning several organizations.";
      expect(malvAssistantTextImpliesOrigin(vague)).toBe(true);
      const out = enforceMalvFinalReplyIdentityPolicy(vague, MALV_IDENTITY_POLICY);
      expect(out.mode).toBe("replace");
      expect(out.text).toBe(MALV_IDENTITY_POLICY.strictNoOriginDetailsResponse);
    });

    it("still handles direct identity questions via reflex classification", () => {
      expect(detectMalvIdentityQuestion("who made you")).toBe("creator");
    });
  });

  describe("truthful route / prompt contract degradation", () => {
    it("downgrades worker prompt route when execution failed so routing text is plain-honest", () => {
      const declared = resolveUniversalMalvCapabilityRoute("latest breaking news today with citations");
      expect(declared.responseMode).not.toBe("plain_model");
      const effective = resolveMalvUniversalCapabilityRouteForWorkerPrompt(declared, {
        ok: false,
        promptInjection: ""
      });
      expect(effective.responseMode).toBe("plain_model");
      const block = formatUniversalCapabilityRoutingContextBlock(effective);
      expect(block.toLowerCase()).not.toContain("never refuse on the grounds that you lack browsing");
      expect(block.toLowerCase()).toContain("verified execution bundle");
    });

    it("keeps declared route when a verified bundle is present", () => {
      const declared = resolveUniversalMalvCapabilityRoute("bitcoin price today");
      const effective = resolveMalvUniversalCapabilityRouteForWorkerPrompt(declared, {
        ok: true,
        promptInjection: "### MALV verified execution bundle\n{}"
      });
      expect(effective.responseMode).toBe(declared.responseMode);
    });

    it("compose skips rich chrome when execution failed", () => {
      const route = resolveUniversalMalvCapabilityRoute("latest news on the storm with sources");
      const out = composeMalvCapabilityRichDelivery({
        route,
        modelReply: "Here is a concise summary.",
        execution: { ok: false, promptInjection: "", rich: null },
        userText: "latest news on the storm with sources"
      });
      expect(out.reply).toBe("Here is a concise summary.");
      expect(out.metaPatch.malvRichResponse).toBeUndefined();
    });
  });

  describe("intent-first question shape", () => {
    it("classifies trailing direct questions on multi-line turns", () => {
      expect(
        classifyMalvQuestionAnswerShape(
          "Some preamble that is not the real ask.\n\nis delta state clean?\n"
        )
      ).toBe("yes_no");
    });

    it("buildMalvChatPrompt still drives yes/no discipline for delta state clean", () => {
      const prompt = buildMalvChatPrompt({
        userMessage: "is delta state clean?",
        contextBlock: "",
        beastLevel: "Smart",
        classifiedMode: "light",
        modeType: "analyze"
      });
      expect(prompt).toContain("yes_no");
      expect(prompt.toLowerCase()).not.toContain("first sentence must answer");
      expect(prompt).toMatch(/first sentence/i);
      expect(prompt).toContain("Hard block tutorial mode");
    });
  });

  describe("light social / reflex", () => {
    it("detects lol? and similar as light social", () => {
      expect(detectLightSocialMessage("lol?")).toBe("amused_ack");
      expect(detectLightSocialMessage("okay")).toBe("amused_ack");
      expect(detectLightSocialMessage("got it")).toBe("amused_ack");
    });

    it("routes lol? through reflex lane under default gates", () => {
      const r = classifyMalvReflexTurn("lol?", {
        superFix: false,
        vaultSessionId: null,
        operatorPhase: null,
        exploreHandoffJson: null,
        modeType: "analyze",
        inputMode: "text"
      });
      expect(r?.kind).toBe("light_social");
    });
  });

  describe("response shaping order", () => {
    it("does not preemptively replace factual answers that mention teams before identity enforcement runs", () => {
      const body =
        "Regional water boards coordinate with engineering firms and volunteer teams; Delta State’s major cities run household pickup programs.";
      const shaped = shapeMalvReply(body);
      expect(shaped.text.toLowerCase()).toContain("volunteer teams");
      expect(shaped.identityEnforcementMode).not.toBe("replace");
    });
  });
});
