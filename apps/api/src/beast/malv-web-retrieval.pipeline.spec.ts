import { resolveUniversalMalvCapabilityRoute } from "./malv-universal-capability-router.util";
import { runMalvWebCapabilityPipeline } from "./malv-web-retrieval.pipeline";
import { filterMalvTrustedRichImages } from "./malv-web-source-trust.util";

describe("malv-web-source-trust.util", () => {
  it("removes picsum and other demonstration image hosts", () => {
    const out = filterMalvTrustedRichImages([
      { url: "https://picsum.photos/seed/x/100/100", alt: "a" },
      { url: "https://cdn.example.org/ok.jpg", alt: "b" }
    ]);
    expect(out.map((x) => x.url)).toEqual(["https://cdn.example.org/ok.jpg"]);
  });
});

describe("runMalvWebCapabilityPipeline", () => {
  const prevBrave = process.env.MALV_BRAVE_SEARCH_API_KEY;
  const prevDis = process.env.MALV_WEB_RETRIEVAL_DISABLED;

  afterEach(() => {
    if (prevBrave === undefined) delete process.env.MALV_BRAVE_SEARCH_API_KEY;
    else process.env.MALV_BRAVE_SEARCH_API_KEY = prevBrave;
    if (prevDis === undefined) delete process.env.MALV_WEB_RETRIEVAL_DISABLED;
    else process.env.MALV_WEB_RETRIEVAL_DISABLED = prevDis;
    jest.restoreAllMocks();
  });

  it("selects web retrieval path for web_research route when Brave is configured", async () => {
    process.env.MALV_BRAVE_SEARCH_API_KEY = "k";
    delete process.env.MALV_WEB_RETRIEVAL_DISABLED;
    jest.spyOn(global, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("api.search.brave.com")) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          body: null,
          text: async () =>
            JSON.stringify({
              web: {
                results: [
                  { title: "T", url: "https://www.nytimes.com/2026/01/01/world/a.html", description: "D" }
                ]
              }
            })
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => "text/html" },
        body: null,
        text: async () => `<html><head><title>NYT</title></head><body></body></html>`
      } as unknown as Response;
    });
    const route = resolveUniversalMalvCapabilityRoute("latest news on astronauts that came back");
    expect(route.responseMode).toBe("web_research");
    const out = await runMalvWebCapabilityPipeline({ userText: "latest news on astronauts that came back", route });
    expect(out.telemetry.malvWebRetrievalRan).toBe(true);
    expect(out.telemetry.malvWebRetrievalProvider).toBe("brave");
    expect(out.ok).toBe(true);
    expect(out.rich?.sources?.[0]?.url).toContain("nytimes.com");
  });

  it("degrades cleanly when Brave is missing", async () => {
    delete process.env.MALV_BRAVE_SEARCH_API_KEY;
    delete process.env.MALV_WEB_RETRIEVAL_DISABLED;
    const route = resolveUniversalMalvCapabilityRoute("latest news on astronauts that came back");
    const out = await runMalvWebCapabilityPipeline({ userText: "latest news on astronauts that came back", route });
    expect(out.ok).toBe(false);
    expect(out.rich).toBeNull();
    expect(out.telemetry.malvWebFailureReason).toBe("missing_brave_api_key");
  });

  it("does not attach fabricated sources on web_research when Brave returns only untrusted URLs", async () => {
    process.env.MALV_BRAVE_SEARCH_API_KEY = "k";
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      body: null,
      text: async () =>
        JSON.stringify({
          web: {
            results: [{ title: "Mock", url: "https://www.reuters.com/world/malv-mock-wire", description: "x" }]
          }
        })
    } as unknown as Response);
    const route = resolveUniversalMalvCapabilityRoute("latest news on astronauts that came back");
    const out = await runMalvWebCapabilityPipeline({ userText: "latest news on astronauts that came back", route });
    expect(out.ok).toBe(false);
    expect(out.rich).toBeNull();
  });
});
