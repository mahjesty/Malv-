import { describe, expect, it } from "vitest";
import { routeHubIntentToExplorePath } from "./exploreIntentRoute";

describe("routeHubIntentToExplorePath", () => {
  it("routes build-like intents to create/reality", () => {
    const r = routeHubIntentToExplorePath("help me build a marketing site");
    expect(r.pathname).toBe("/app/explore/create/reality");
    expect(r.search).toContain("q=");
  });

  it("routes fix intents", () => {
    const r = routeHubIntentToExplorePath("our checkout flow is broken");
    expect(r.pathname).toBe("/app/explore/fix/fix-anything");
  });

  it("defaults to explain", () => {
    const r = routeHubIntentToExplorePath("something abstract");
    expect(r.pathname).toBe("/app/explore/think/explain");
  });

  it("routes resume intents", () => {
    const r = routeHubIntentToExplorePath("help polish my resume");
    expect(r.pathname).toBe("/app/explore/grow/resume");
  });
});
