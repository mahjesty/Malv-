import {
  isLikelyPlaceholderPreviewImageUrl,
  normalizePublishedPreviewImageUrl,
  readWebAppOriginBaseFromEnv,
  sanitizePreviewImageUrlForPersistence
} from "./published-preview-image-url.util";

describe("published-preview-image-url.util", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("normalizePublishedPreviewImageUrl", () => {
    it("resolves root-relative explore-catalog paths against WEB_ORIGIN", () => {
      process.env.WEB_ORIGIN = "https://app.example.com";
      expect(normalizePublishedPreviewImageUrl("/explore-catalog/ai-chat-interface.svg")).toBe(
        "https://app.example.com/explore-catalog/ai-chat-interface.svg"
      );
    });

    it("uses first origin when WEB_ORIGIN is comma-separated", () => {
      process.env.WEB_ORIGIN = "https://primary.app,https://fallback.app";
      expect(normalizePublishedPreviewImageUrl("/x.svg")).toBe("https://primary.app/x.svg");
    });

    it("defaults to localhost when no origin env is set", () => {
      delete process.env.WEB_ORIGIN;
      delete process.env.SOCKET_CORS_ORIGIN;
      expect(normalizePublishedPreviewImageUrl("/explore-catalog/landing-page.svg")).toMatch(
        /^http:\/\/localhost:5173\/explore-catalog\/landing-page\.svg$/
      );
    });

    it("prefers SOCKET_CORS_ORIGIN over WEB_ORIGIN", () => {
      process.env.SOCKET_CORS_ORIGIN = "https://socket.example";
      process.env.WEB_ORIGIN = "https://web.example";
      expect(normalizePublishedPreviewImageUrl("/a.png")).toBe("https://socket.example/a.png");
    });

    it("passes through absolute https URLs", () => {
      expect(normalizePublishedPreviewImageUrl("https://cdn.example.com/p.png")).toBe("https://cdn.example.com/p.png");
    });

    it("returns null for placeholder assets", () => {
      expect(normalizePublishedPreviewImageUrl("/placeholder.svg")).toBeNull();
      expect(normalizePublishedPreviewImageUrl("https://cdn.example.com/placeholder-logo.svg")).toBeNull();
    });

    it("returns null for protocol-relative URLs", () => {
      expect(normalizePublishedPreviewImageUrl("//evil.com/x.png")).toBeNull();
    });

    it("returns null for empty or whitespace", () => {
      expect(normalizePublishedPreviewImageUrl(null)).toBeNull();
      expect(normalizePublishedPreviewImageUrl("")).toBeNull();
      expect(normalizePublishedPreviewImageUrl("  ")).toBeNull();
    });
  });

  describe("sanitizePreviewImageUrlForPersistence", () => {
    it("strips placeholders but keeps root-relative catalog paths", () => {
      expect(sanitizePreviewImageUrlForPersistence("/placeholder.svg")).toBeNull();
      expect(sanitizePreviewImageUrlForPersistence("/explore-catalog/x.svg")).toBe("/explore-catalog/x.svg");
    });
  });

  describe("isLikelyPlaceholderPreviewImageUrl", () => {
    it("detects explore-preview-snapshot filename", () => {
      expect(isLikelyPlaceholderPreviewImageUrl("/previews/explore-preview-snapshot.svg")).toBe(true);
    });
  });

  describe("readWebAppOriginBaseFromEnv", () => {
    it("trims trailing slashes from configured origin", () => {
      process.env.WEB_ORIGIN = "https://app.example.com/";
      expect(readWebAppOriginBaseFromEnv()).toBe("https://app.example.com");
    });
  });
});
