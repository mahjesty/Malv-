import {
  MALV_IDENTITY_POLICY,
  buildCanonicalIdentityPolicyLine,
  resolveMalvIdentityResponse
} from "./malv-identity-policy";

describe("MALV identity policy", () => {
  it("anchors assistant identity and forbidden claims in one source", () => {
    expect(MALV_IDENTITY_POLICY.assistantName).toBe("MALV");
    expect(MALV_IDENTITY_POLICY.explicitForbiddenIdentityClaims.some((x) => /qwen/i.test(x))).toBe(true);
    expect(MALV_IDENTITY_POLICY.explicitForbiddenIdentityClaims.some((x) => /alibaba/i.test(x))).toBe(true);
    expect(MALV_IDENTITY_POLICY.strictNoOriginDetailsResponse).toContain("I'm MALV");
    expect(MALV_IDENTITY_POLICY.strictNoOriginDetailsResponse.toLowerCase()).toContain("malv system");
    expect(MALV_IDENTITY_POLICY.strictNoOriginDetailsResponse.toLowerCase()).toContain("deliberate product identity");
    expect(MALV_IDENTITY_POLICY.strictNoOriginDetailsResponse.toLowerCase()).toContain("defined role");
  });

  it("uses assertive identity fallbacks without defensive negative framing", () => {
    const defensive = /\bnot (defined|framed|summarized)\b|aren't part|don't disclose/i;
    expect(MALV_IDENTITY_POLICY.creatorDisclosure.fallback).not.toMatch(defensive);
    expect(MALV_IDENTITY_POLICY.founderDisclosure.fallback).not.toMatch(defensive);
    expect(MALV_IDENTITY_POLICY.companyDisclosure.fallback).not.toMatch(defensive);
    expect(MALV_IDENTITY_POLICY.strictNoOriginDetailsResponse).not.toMatch(defensive);
    expect(MALV_IDENTITY_POLICY.creatorDisclosure.fallback.toLowerCase()).toContain("malv system");
    expect(MALV_IDENTITY_POLICY.founderDisclosure.fallback.toLowerCase()).toContain("malv system");
    expect(MALV_IDENTITY_POLICY.companyDisclosure.fallback.toLowerCase()).toContain("malv");
  });

  it("builds canonical policy line for prompt identity lock", () => {
    const line = buildCanonicalIdentityPolicyLine();
    expect(line).toContain("You are MALV");
    expect(line.toLowerCase()).toContain("creator/founder/company/origin");
    expect(line.toLowerCase()).toContain("never invent or guess");
  });

  it("returns deterministic canonical responses per identity category", () => {
    expect(resolveMalvIdentityResponse("who")).toBe("I'm MALV.");
    expect(resolveMalvIdentityResponse("creator").toLowerCase()).toContain("malv system");
    expect(resolveMalvIdentityResponse("model").toLowerCase()).toContain("underlying intelligence");
    expect(resolveMalvIdentityResponse("powered_by").toLowerCase()).toContain("malv stack");
    expect(resolveMalvIdentityResponse("comparison")).toContain("I'm MALV");
    expect(resolveMalvIdentityResponse("comparison").toLowerCase()).toContain("malv assistant identity");
  });
});
