import * as executionUtil from "./malv-universal-capability-execution.util";
import { resolveUniversalMalvCapabilityRoute } from "./malv-universal-capability-router.util";
import {
  malvUniversalRouteExecutionPolicy,
  resolveMalvUniversalCapabilityExecutionOutcome,
  isMalvUniversalRouteExecutionImplemented
} from "./malv-universal-capability-route-lifecycle.util";

describe("isMalvUniversalRouteExecutionImplemented", () => {
  it("treats plain_model as implemented (skip path)", () => {
    expect(isMalvUniversalRouteExecutionImplemented("plain_model")).toBe(true);
  });

  it("marks known non-plain routes implemented", () => {
    expect(isMalvUniversalRouteExecutionImplemented("finance_data")).toBe(true);
    expect(isMalvUniversalRouteExecutionImplemented("web_research")).toBe(true);
  });
});

describe("resolveMalvUniversalCapabilityExecutionOutcome", () => {
  it("returns route_execution telemetry for finance route", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("api.coingecko.com/api/v3/coins/bitcoin?")) {
        const body = JSON.stringify({
          name: "Bitcoin",
          symbol: "btc",
          market_data: {
            current_price: { usd: 50_000 },
            price_change_24h: -1,
            price_change_percentage_24h: -0.1,
            high_24h: { usd: 51_000 },
            low_24h: { usd: 49_000 }
          }
        });
        return { ok: true, status: 200, headers: { get: () => "application/json" }, body: null, text: async () => body } as unknown as Response;
      }
      if (url.includes("market_chart")) {
        const body = JSON.stringify({ prices: [[Date.now(), 50_000]] });
        return { ok: true, status: 200, headers: { get: () => "application/json" }, body: null, text: async () => body } as unknown as Response;
      }
      const body = JSON.stringify({});
      return { ok: true, status: 200, headers: { get: () => "application/json" }, body: null, text: async () => body } as unknown as Response;
    });
    const route = resolveUniversalMalvCapabilityRoute("bitcoin price today till date");
    expect(route.responseMode).not.toBe("plain_model");
    const out = await resolveMalvUniversalCapabilityExecutionOutcome({
      userText: "bitcoin price today till date",
      route
    });
    expect(fetchMock).toHaveBeenCalled();
    expect(out.execution.ok).toBe(true);
    expect(out.execution.promptInjection.length).toBeGreaterThan(10);
    expect(out.telemetry.malvUniversalRouteFinalOutputSource).toBe("route_execution");
    expect(out.telemetry.malvUniversalRouteFallbackTriggered).toBe(false);
    expect(out.telemetry.malvWebRetrieval?.malvWebFinanceProvenance).toBe("coingecko");
    fetchMock.mockRestore();
  });

  it("returns plain_model telemetry for non-finance queries", async () => {
    const route = resolveUniversalMalvCapabilityRoute("what is a monoid");
    expect(route.responseMode).toBe("plain_model");
    const out = await resolveMalvUniversalCapabilityExecutionOutcome({
      userText: "what is a monoid",
      route
    });
    expect(out.execution.skipped).toBe(true);
    expect(out.telemetry.malvUniversalRouteFinalOutputSource).toBe("route_skipped_plain");
  });

  it("maps thrown execution to fallback telemetry", async () => {
    const spy = jest.spyOn(executionUtil, "runMalvUniversalCapabilityExecution").mockImplementation(async () => {
      throw new Error("route_handler_threw");
    });
    try {
      const route = resolveUniversalMalvCapabilityRoute("bitcoin price today till date");
      const out = await resolveMalvUniversalCapabilityExecutionOutcome({
        userText: "bitcoin price today till date",
        route
      });
      expect(out.execution.ok).toBe(false);
      expect(out.telemetry.malvUniversalRouteFallbackReason).toBe("execution_threw");
      expect(out.telemetry.malvUniversalRouteFinalOutputSource).toBe("plain_model_fallback");
    } finally {
      spy.mockRestore();
    }
  });

  it("returns not-implemented bundle when handler registry says route is unsupported", async () => {
    const spy = jest.spyOn(malvUniversalRouteExecutionPolicy, "isImplemented").mockReturnValue(false);
    try {
      const route = resolveUniversalMalvCapabilityRoute("bitcoin price today till date");
      const out = await resolveMalvUniversalCapabilityExecutionOutcome({
        userText: "bitcoin price today till date",
        route
      });
      expect(out.execution.ok).toBe(false);
      expect(out.execution.error).toBe("universal_route_execution_not_implemented");
      expect(out.telemetry.malvUniversalRouteFallbackReason).toBe("no_handler_registered_for_route");
    } finally {
      spy.mockRestore();
    }
  });

  it("maps simulated execution failure to fallback telemetry", async () => {
    const prev = process.env.MALV_SIMULATE_CAPABILITY_EXECUTION_FAILURE;
    process.env.MALV_SIMULATE_CAPABILITY_EXECUTION_FAILURE = "1";
    try {
      const route = resolveUniversalMalvCapabilityRoute("bitcoin price today till date");
      const out = await resolveMalvUniversalCapabilityExecutionOutcome({
        userText: "bitcoin price today till date",
        route
      });
      expect(out.execution.ok).toBe(false);
      expect(out.telemetry.malvUniversalRouteFallbackTriggered).toBe(true);
      expect(out.telemetry.malvUniversalRouteFinalOutputSource).toBe("plain_model_fallback");
    } finally {
      if (prev === undefined) delete process.env.MALV_SIMULATE_CAPABILITY_EXECUTION_FAILURE;
      else process.env.MALV_SIMULATE_CAPABILITY_EXECUTION_FAILURE = prev;
    }
  });
});
