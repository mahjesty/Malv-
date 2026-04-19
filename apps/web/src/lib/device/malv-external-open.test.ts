import { describe, expect, it } from "vitest";
import {
  isAndroidWebViewUserAgent,
  isDesktopWebUserAgent,
  isIosLikeUserAgent,
  isLikelyIosEmbeddedBrowser,
  malvPruneExternalOpenQuickActions,
  resolveMalvExternalOpenButtonLabel,
  resolveMalvExternalOpenPreviewAriaDescription,
  resolveMalvExternalOpenSourcesFlowBlurb
} from "./malv-external-open";

describe("resolveMalvExternalOpenButtonLabel", () => {
  it("uses desktop wording for macOS Safari desktop UA", () => {
    expect(
      resolveMalvExternalOpenButtonLabel({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        maxTouchPoints: 0
      })
    ).toBe("Open in browser");
  });

  it("uses Safari wording for iOS Mobile Safari", () => {
    expect(
      resolveMalvExternalOpenButtonLabel({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        maxTouchPoints: 5
      })
    ).toBe("Open in Safari");
  });

  it("uses Chrome wording for Chrome on iOS", () => {
    expect(
      resolveMalvExternalOpenButtonLabel({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/119.0.6045.109 Mobile/15E148 Safari/604.1",
        maxTouchPoints: 5
      })
    ).toBe("Open in Chrome");
  });

  it("falls back when iOS in-app browser markers are present", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1 [FBAN/FBIOS;FBAV/1.0]";
    expect(isLikelyIosEmbeddedBrowser(ua)).toBe(true);
    expect(resolveMalvExternalOpenButtonLabel({ userAgent: ua, maxTouchPoints: 5 })).toBe("Open externally");
  });

  it("uses browser wording for Android Chrome (not webview)", () => {
    expect(
      resolveMalvExternalOpenButtonLabel({
        userAgent:
          "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36",
        maxTouchPoints: 1
      })
    ).toBe("Open in browser");
  });

  it("uses external wording for Android System WebView", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0.6045.163 Mobile Safari/537.36";
    expect(isAndroidWebViewUserAgent(ua)).toBe(true);
    expect(resolveMalvExternalOpenButtonLabel({ userAgent: ua })).toBe("Open externally");
  });

  it("prefers Capacitor iOS over UA heuristics", () => {
    expect(
      resolveMalvExternalOpenButtonLabel({
        userAgent: "Mozilla/5.0 (custom shell)",
        capacitorPlatform: "ios"
      })
    ).toBe("Open in Safari");
  });

  it("uses external wording for Capacitor Android", () => {
    expect(
      resolveMalvExternalOpenButtonLabel({
        userAgent: "Mozilla/5.0 (Linux; Android 13)",
        capacitorPlatform: "android"
      })
    ).toBe("Open externally");
  });

  it("gracefully degrades on empty UA", () => {
    expect(resolveMalvExternalOpenButtonLabel({ userAgent: "" })).toBe("Open externally");
  });
});

describe("resolveMalvExternalOpenPreviewAriaDescription", () => {
  it("includes the same label as the visible control", () => {
    const h = {
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
    };
    const label = resolveMalvExternalOpenButtonLabel(h);
    expect(resolveMalvExternalOpenPreviewAriaDescription(h)).toContain(label);
  });
});

describe("resolveMalvExternalOpenSourcesFlowBlurb", () => {
  it("embeds the platform-aware label", () => {
    const h = {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
    };
    expect(resolveMalvExternalOpenSourcesFlowBlurb(h)).toContain("Open in browser");
  });
});

describe("malvPruneExternalOpenQuickActions", () => {
  it("removes open_externally while preserving order of other actions", () => {
    const out = malvPruneExternalOpenQuickActions([
      { id: "open_primary_source", label: "Preview" },
      { id: "open_externally", label: "Browser" },
      { id: "save_turn", label: "Save" }
    ]);
    expect(out.map((a) => a.id)).toEqual(["open_primary_source", "save_turn"]);
  });
});

describe("helpers", () => {
  it("classifies iPadOS desktop UA with touch as iOS-like", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
    expect(isIosLikeUserAgent(ua, 5)).toBe(true);
    expect(isDesktopWebUserAgent(ua, 5)).toBe(false);
  });
});
