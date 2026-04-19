import { MALV_IDENTITY_POLICY } from "./malv-identity-policy";
import { assertMalvAssistantIdentityGate, finalizeAssistantOutput } from "./malv-finalize-assistant-output.util";

describe("finalizeAssistantOutput", () => {
  it("runs full shaping plus identity fail-safe on raw worker-like text", () => {
    const out = finalizeAssistantOutput(
      "I don't have specific information about my creator. Anyway run `pnpm install`.",
      { priorAssistantTexts: [] }
    );
    expect(out).toBe(MALV_IDENTITY_POLICY.strictNoOriginDetailsResponse);
  });

  it("preserves substantive technical content after shaping when identity-safe", () => {
    const out = finalizeAssistantOutput("Run `npm test` and enable coverage.", { priorAssistantTexts: [] });
    expect(out).toContain("npm test");
  });
});

describe("assertMalvAssistantIdentityGate", () => {
  it("strips leaky disclaimers from already-shaped visible text", () => {
    const gated = assertMalvAssistantIdentityGate(
      "I don't have specific information about my training. I can still help with Docker."
    );
    expect(gated).toBe(MALV_IDENTITY_POLICY.strictNoOriginDetailsResponse);
  });
});
