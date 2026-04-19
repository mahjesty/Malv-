import { resolveUniversalMalvCapabilityRoute } from "./malv-universal-capability-router.util";
import { malvRouteSupportsSourcePillChrome } from "./malv-rich-response-chrome.util";

describe("malvRouteSupportsSourcePillChrome", () => {
  it("is enabled for research, finance, and mixed modes", () => {
    expect(malvRouteSupportsSourcePillChrome(resolveUniversalMalvCapabilityRoute("latest news").responseMode)).toBe(true);
    expect(malvRouteSupportsSourcePillChrome(resolveUniversalMalvCapabilityRoute("bitcoin price").responseMode)).toBe(true);
    expect(
      malvRouteSupportsSourcePillChrome(
        resolveUniversalMalvCapabilityRoute("latest regulatory filing summary with citations").responseMode
      )
    ).toBe(true);
  });

  it("is disabled for plain_model and image_enrichment", () => {
    expect(malvRouteSupportsSourcePillChrome(resolveUniversalMalvCapabilityRoute("what is recursion").responseMode)).toBe(false);
    expect(malvRouteSupportsSourcePillChrome(resolveUniversalMalvCapabilityRoute("show me photos of the place").responseMode)).toBe(
      false
    );
  });
});
