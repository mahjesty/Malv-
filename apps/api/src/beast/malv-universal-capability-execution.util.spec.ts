import { resolveUniversalMalvCapabilityRoute } from "./malv-universal-capability-router.util";
import { runMalvUniversalCapabilityExecution } from "./malv-universal-capability-execution.util";
import { composeMalvCapabilityRichDelivery } from "./malv-universal-capability-response-compose.util";

function mockJsonResponse(obj: unknown): Response {
  const body = JSON.stringify(obj);
  return {
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    body: null,
    text: async () => body
  } as unknown as Response;
}

function mockHtmlResponse(html: string): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: () => "text/html" },
    body: null,
    text: async () => html
  } as unknown as Response;
}

describe("runMalvUniversalCapabilityExecution", () => {
  const prevBrave = process.env.MALV_BRAVE_SEARCH_API_KEY;
  const prevWebDis = process.env.MALV_WEB_RETRIEVAL_DISABLED;
  const prevFinDis = process.env.MALV_FINANCE_QUOTES_DISABLED;

  beforeEach(() => {
    delete process.env.MALV_SIMULATE_CAPABILITY_EXECUTION_FAILURE;
    process.env.MALV_BRAVE_SEARCH_API_KEY = "test-brave-key";
    delete process.env.MALV_WEB_RETRIEVAL_DISABLED;
    delete process.env.MALV_FINANCE_QUOTES_DISABLED;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (prevBrave === undefined) delete process.env.MALV_BRAVE_SEARCH_API_KEY;
    else process.env.MALV_BRAVE_SEARCH_API_KEY = prevBrave;
    if (prevWebDis === undefined) delete process.env.MALV_WEB_RETRIEVAL_DISABLED;
    else process.env.MALV_WEB_RETRIEVAL_DISABLED = prevWebDis;
    if (prevFinDis === undefined) delete process.env.MALV_FINANCE_QUOTES_DISABLED;
    else process.env.MALV_FINANCE_QUOTES_DISABLED = prevFinDis;
  });

  it("returns skipped for plain_model", async () => {
    const route = resolveUniversalMalvCapabilityRoute("what is recursion");
    expect(route.responseMode).toBe("plain_model");
    const { execution } = await runMalvUniversalCapabilityExecution({ userText: "what is recursion", route });
    expect(execution.skipped).toBe(true);
    expect(execution.promptInjection).toBe("");
    expect(execution.rich).toBeNull();
  });

  it("finance_data returns structured data from mocked CoinGecko", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("api.coingecko.com/api/v3/coins/bitcoin?")) {
        return mockJsonResponse({
          name: "Bitcoin",
          symbol: "btc",
          market_data: {
            current_price: { usd: 50_000 },
            price_change_24h: -120,
            price_change_percentage_24h: -0.25,
            high_24h: { usd: 51_000 },
            low_24h: { usd: 49_000 }
          }
        });
      }
      if (url.includes("api.coingecko.com/api/v3/coins/bitcoin/market_chart")) {
        return mockJsonResponse({
          prices: [
            [Date.now() - 6 * 86400000, 49_000],
            [Date.now() - 5 * 86400000, 49_200],
            [Date.now() - 4 * 86400000, 49_500],
            [Date.now() - 3 * 86400000, 49_800],
            [Date.now() - 2 * 86400000, 49_900],
            [Date.now() - 86400000, 50_000],
            [Date.now(), 50_000]
          ]
        });
      }
      return mockJsonResponse({});
    });
    const route = resolveUniversalMalvCapabilityRoute("give me bitcoin price from last week till date");
    expect(route.responseMode).toBe("finance_data");
    const { execution } = await runMalvUniversalCapabilityExecution({
      userText: "give me bitcoin price from last week till date",
      route
    });
    expect(fetchMock).toHaveBeenCalled();
    expect(execution.ok).toBe(true);
    expect(execution.promptInjection).toContain("MALV verified execution");
    expect(execution.promptInjection).toContain("BTC");
    expect(execution.rich?.data).toMatchObject({ kind: "malv_finance_snapshot", symbol: "BTC" });
    expect(Array.isArray(execution.rich?.sources)).toBe(true);
  });

  it("web_research returns grounded sources from mocked Brave", async () => {
    jest.spyOn(global, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("api.search.brave.com/res/v1/web/search")) {
        return mockJsonResponse({
          web: {
            results: [
              {
                title: "Wire story",
                url: "https://www.reuters.com/world/space/article",
                description: "Astronauts returned safely."
              },
              {
                title: "Second angle",
                url: "https://www.theguardian.com/science/article",
                description: "Mission recap."
              }
            ]
          }
        });
      }
      if (url.includes("reuters.com")) {
        return mockHtmlResponse(
          `<html><head><meta name="description" content="Detailed mission reporting." /><title>Reuters</title></head><body></body></html>`
        );
      }
      if (url.includes("theguardian.com")) {
        return mockHtmlResponse(`<html><head><title>Guardian</title></head><body></body></html>`);
      }
      return mockHtmlResponse("<html></html>");
    });
    const route = resolveUniversalMalvCapabilityRoute("latest news on astronauts that came back");
    expect(route.responseMode).toBe("web_research");
    const { execution } = await runMalvUniversalCapabilityExecution({
      userText: "latest news on astronauts that came back",
      route
    });
    expect(execution.ok).toBe(true);
    expect(execution.rich?.data).toMatchObject({ kind: "malv_web_research_bundle" });
    const data = execution.rich?.data as { keyFacts?: string[] };
    expect(Array.isArray(data?.keyFacts)).toBe(true);
    expect((data?.keyFacts?.length ?? 0) >= 1).toBe(true);
    expect(execution.rich?.sources?.length).toBeGreaterThanOrEqual(1);
    expect(execution.rich?.sources?.every((s) => !/picsum/i.test(s.url))).toBe(true);
  });

  it("image_enrichment does not surface picsum URLs", async () => {
    jest.spyOn(global, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("api.search.brave.com/res/v1/images/search")) {
        return mockJsonResponse({
          results: [
            { properties: { url: "https://picsum.photos/seed/x/100/100" }, title: "Bad" },
            { properties: { url: "https://cdn.example.com/real.jpg" }, title: "Good", source: "Example" }
          ]
        });
      }
      return mockJsonResponse({});
    });
    const route = resolveUniversalMalvCapabilityRoute("show me photos of the place");
    expect(route.responseMode).toBe("image_enrichment");
    const { execution } = await runMalvUniversalCapabilityExecution({ userText: "show me photos of the place", route });
    expect(execution.ok).toBe(true);
    const urls = (execution.rich?.images ?? []).map((i) => i.url);
    expect(urls.every((u) => !/picsum/i.test(u))).toBe(true);
  });

  it("mixed_text_plus_visual suppresses images when only untrusted URLs return", async () => {
    jest.spyOn(global, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/res/v1/web/search")) {
        return mockJsonResponse({
          web: {
            results: [
              { title: "News", url: "https://www.reuters.com/world/x", description: "Headline" }
            ]
          }
        });
      }
      if (url.includes("/res/v1/images/search")) {
        return mockJsonResponse({
          results: [{ properties: { url: "https://picsum.photos/seed/bad/800/600" }, title: "x" }]
        });
      }
      if (url.includes("reuters.com")) {
        return mockHtmlResponse(`<html><meta name="description" content="Body" /></html>`);
      }
      return mockJsonResponse({});
    });
    const route = resolveUniversalMalvCapabilityRoute(
      "show me photos of the landmark and latest news headlines today"
    );
    expect(route.responseMode).toBe("mixed_text_plus_visual");
    const { execution } = await runMalvUniversalCapabilityExecution({
      userText: "show me photos of the landmark and latest news headlines today",
      route
    });
    expect(execution.ok).toBe(true);
    expect((execution.rich?.images ?? []).length).toBe(0);
    expect(execution.rich?.sources?.length).toBeGreaterThanOrEqual(1);
  });

  it("mixed_text_plus_sources combines mocked web + finance", async () => {
    jest.spyOn(global, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/res/v1/web/search")) {
        return mockJsonResponse({
          web: {
            results: [{ title: "Filing wire", url: "https://www.sec.gov/news/press", description: "Filing note" }]
          }
        });
      }
      if (url.includes("sec.gov")) {
        return mockHtmlResponse(`<html><meta property="og:description" content="SEC press detail." /></html>`);
      }
      if (url.includes("api.coingecko.com")) {
        return mockJsonResponse({});
      }
      if (url.includes("query1.finance.yahoo.com") || url.includes("finance.yahoo.com")) {
        return mockJsonResponse({
          chart: {
            result: [
              {
                meta: { regularMarketPrice: 100, currency: "USD", symbol: "TWO" },
                timestamp: [1, 2, 3],
                indicators: { quote: [{ close: [90, 95, 100] }] }
              }
            ]
          }
        });
      }
      return mockJsonResponse({});
    });
    const route = resolveUniversalMalvCapabilityRoute("compare the latest updates on two companies");
    expect(route.responseMode).toBe("mixed_text_plus_sources");
    const { execution } = await runMalvUniversalCapabilityExecution({
      userText: "compare the latest updates on two companies",
      route
    });
    expect(execution.ok).toBe(true);
    expect((execution.rich?.sources?.length ?? 0) >= 1).toBe(true);
    const bundle = execution.rich?.data as { research?: unknown; finance?: unknown };
    expect(bundle?.research).toBeTruthy();
    expect(bundle?.finance).toBeTruthy();
  });

  it("fails cleanly when Brave is required but missing", async () => {
    delete process.env.MALV_BRAVE_SEARCH_API_KEY;
    const route = resolveUniversalMalvCapabilityRoute("latest news on astronauts that came back");
    const { execution } = await runMalvUniversalCapabilityExecution({
      userText: "latest news on astronauts that came back",
      route
    });
    expect(execution.ok).toBe(false);
    expect(execution.rich).toBeNull();
  });
});

describe("composeMalvCapabilityRichDelivery", () => {
  it("plain_model leaves reply unchanged", async () => {
    const route = resolveUniversalMalvCapabilityRoute("what is a monoid");
    const { execution } = await runMalvUniversalCapabilityExecution({ userText: "what is a monoid", route });
    const out = composeMalvCapabilityRichDelivery({
      route,
      modelReply: "A monoid is …",
      execution
    });
    expect(out.reply).toBe("A monoid is …");
    expect(Object.keys(out.metaPatch).length).toBe(0);
  });

  it("on execution failure keeps model text and marks error", () => {
    const route = resolveUniversalMalvCapabilityRoute("give me bitcoin price today");
    const out = composeMalvCapabilityRichDelivery({
      route,
      modelReply: "Here is the narrative.",
      execution: { ok: false, error: "boom", promptInjection: "", rich: null }
    });
    expect(out.reply).toBe("Here is the narrative.");
    expect(out.metaPatch.malvCapabilityExecutionOk).toBe(false);
  });

  it("prepends finance execution lead-in and attaches malvRichResponse", async () => {
    const route = resolveUniversalMalvCapabilityRoute("bitcoin price today");
    expect(route.responseMode).toBe("finance_data");
    jest.spyOn(global, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("api.coingecko.com/api/v3/coins/bitcoin?")) {
        return mockJsonResponse({
          name: "Bitcoin",
          symbol: "btc",
          market_data: {
            current_price: { usd: 42_000 },
            price_change_24h: 10,
            price_change_percentage_24h: 0.1,
            high_24h: { usd: 43_000 },
            low_24h: { usd: 41_000 }
          }
        });
      }
      if (url.includes("market_chart")) {
        return mockJsonResponse({ prices: [[Date.now(), 42_000]] });
      }
      return mockJsonResponse({});
    });
    process.env.MALV_BRAVE_SEARCH_API_KEY = "k";
    const { execution } = await runMalvUniversalCapabilityExecution({ userText: "bitcoin price today", route });
    const out = composeMalvCapabilityRichDelivery({
      route,
      modelReply: "Here is a short interpretation.",
      execution
    });
    expect(out.reply.toLowerCase()).toContain("last traded");
    expect(out.reply).toContain("Here is a short interpretation.");
    expect(out.metaPatch.malvRichResponse).toBeTruthy();
  });
});
