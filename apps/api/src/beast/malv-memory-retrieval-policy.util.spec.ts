import { resolveMalvMemoryRetrievalPolicy } from "./malv-memory-retrieval-policy.util";

describe("resolveMalvMemoryRetrievalPolicy", () => {
  it("skips memory for simple tier short turns without cues", () => {
    expect(
      resolveMalvMemoryRetrievalPolicy({
        override: null,
        vaultScoped: false,
        collaborationMode: false,
        contextAssemblyTier: "simple",
        userMessage: "quick ping"
      })
    ).toBe("skip");
  });

  it("respects lowered memoryCueLengthThreshold for minimal retrieval", () => {
    const msg = "x".repeat(150);
    expect(
      resolveMalvMemoryRetrievalPolicy({
        override: null,
        vaultScoped: false,
        collaborationMode: false,
        contextAssemblyTier: "simple",
        userMessage: msg,
        memoryCueLengthThreshold: 140
      })
    ).toBe("minimal");
  });

  it("uses minimal when recall cue present", () => {
    expect(
      resolveMalvMemoryRetrievalPolicy({
        override: null,
        vaultScoped: false,
        collaborationMode: false,
        contextAssemblyTier: "simple",
        userMessage: "what did we discuss earlier about auth?"
      })
    ).toBe("minimal");
  });

  it("forces full for vault", () => {
    expect(
      resolveMalvMemoryRetrievalPolicy({
        override: null,
        vaultScoped: true,
        collaborationMode: false,
        contextAssemblyTier: "simple",
        userMessage: "hi"
      })
    ).toBe("full");
  });
});
