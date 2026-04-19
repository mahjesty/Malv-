import { stripMalvOfflineCapabilityDisclaimers } from "./malv-anti-offline-capability-disclaimer.util";
import { resolveUniversalMalvCapabilityRoute } from "./malv-universal-capability-router.util";

describe("malv-anti-offline-capability-disclaimer.util", () => {
  it("strips offline disclaimers when the universal route expects grounded capabilities", () => {
    const route = resolveUniversalMalvCapabilityRoute("latest price of AAPL today");
    const raw =
      "I don't have real-time market data. I can't browse the web. Here is a qualitative take: Apple tends to move with earnings.";
    const out = stripMalvOfflineCapabilityDisclaimers(raw, route);
    expect(out).not.toMatch(/I don't have real-time/i);
    expect(out).not.toMatch(/can't browse/i);
    expect(out.toLowerCase()).toContain("apple");
  });

  it("does not strip disclaimers for plain_model routes", () => {
    const route = resolveUniversalMalvCapabilityRoute("what is a monoid");
    const raw = "I don't have real-time access to your codebase; share the file if you want a precise review.";
    expect(stripMalvOfflineCapabilityDisclaimers(raw, route)).toBe(raw);
  });
});
