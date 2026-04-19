import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeApiBuildUnit, type ApiBuildUnit } from "../api/dataPlane";
import {
  devWarnPreviewInvariantViolation,
  isLikelyPlaceholderPreviewImageUrl,
  isUsableExternalPreviewImageUrl,
  mergePreviewImageUrlWhenSupplementNewer,
  previewUrlPathnameLower,
  resetPreviewInvariantDevDedupeForTests,
  sanitizeBuildUnitPreviewFields,
  sanitizePreviewFields,
  stripPlaceholderPreviewImageUrlFields,
  usableExternalPreviewImageUrl
} from "./previewArtifactValidation";

afterEach(() => {
  resetPreviewInvariantDevDedupeForTests();
  vi.restoreAllMocks();
});

describe("previewArtifactValidation", () => {
  it("detects public placeholder filenames", () => {
    expect(isLikelyPlaceholderPreviewImageUrl("/placeholder.svg")).toBe(true);
    expect(isLikelyPlaceholderPreviewImageUrl("https://x.com/assets/placeholder-logo.svg")).toBe(true);
    expect(isLikelyPlaceholderPreviewImageUrl("/static/placeholder.png")).toBe(true);
    expect(isLikelyPlaceholderPreviewImageUrl("/dist/placeholder-card.webp")).toBe(true);
    expect(isLikelyPlaceholderPreviewImageUrl("/previews/explore-preview-snapshot.svg")).toBe(true);
  });

  it("allows real CDN and app-relative preview paths", () => {
    expect(isLikelyPlaceholderPreviewImageUrl("https://cdn.example.com/units/abc/preview.png")).toBe(false);
    expect(isLikelyPlaceholderPreviewImageUrl("/explore-catalog/widget-thumb.png")).toBe(false);
    expect(isLikelyPlaceholderPreviewImageUrl("blob:http://localhost/uuid")).toBe(false);
  });

  it("usableExternalPreviewImageUrl rejects placeholders and accepts valid URLs", () => {
    expect(usableExternalPreviewImageUrl("/placeholder.svg")).toBe(null);
    expect(usableExternalPreviewImageUrl("https://cdn.example.com/p.png")).toBe("https://cdn.example.com/p.png");
  });

  it("isUsableExternalPreviewImageUrl accepts only absolute http(s) and blob URLs (not root-relative)", () => {
    expect(isUsableExternalPreviewImageUrl("https://a/b.jpg")).toBe(true);
    expect(isUsableExternalPreviewImageUrl("http://a/b.jpg")).toBe(true);
    expect(isUsableExternalPreviewImageUrl("/x/y.png")).toBe(false);
    expect(isUsableExternalPreviewImageUrl("/explore-catalog/widget-thumb.png")).toBe(false);
    expect(isUsableExternalPreviewImageUrl("blob:x")).toBe(true);
    expect(isUsableExternalPreviewImageUrl("//evil")).toBe(false);
    expect(isUsableExternalPreviewImageUrl("/placeholder.svg")).toBe(false);
  });

  it("previewUrlPathnameLower parses http(s) and root-relative paths", () => {
    expect(previewUrlPathnameLower("https://H.COM/A/B?x=1")).toBe("/a/b");
    expect(previewUrlPathnameLower("/Foo.PNG?q=1")).toBe("/foo.png");
  });

  it("stripPlaceholderPreviewImageUrlFields nulls placeholder lineage", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const u = { id: "1", previewImageUrl: "/placeholder.svg" as string | null };
    const out = stripPlaceholderPreviewImageUrlFields(u);
    expect(out.previewImageUrl).toBeNull();
  });

  it("sanitizeBuildUnitPreviewFields nulls placeholders and other unusable URLs", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(sanitizeBuildUnitPreviewFields({ id: "a", previewImageUrl: "/placeholder.svg" }).previewImageUrl).toBeNull();
    expect(sanitizeBuildUnitPreviewFields({ id: "b", previewImageUrl: "not-a-url" }).previewImageUrl).toBeNull();
    expect(sanitizeBuildUnitPreviewFields({ id: "c", previewImageUrl: "//evil" }).previewImageUrl).toBeNull();
  });

  it("sanitizeBuildUnitPreviewFields keeps usable URLs and matches sanitizePreviewFields", () => {
    const u = { id: "d", previewImageUrl: "https://cdn.example.com/p.png" };
    expect(sanitizeBuildUnitPreviewFields(u).previewImageUrl).toBe("https://cdn.example.com/p.png");
    expect(sanitizePreviewFields(u).previewImageUrl).toBe("https://cdn.example.com/p.png");
  });

  it("sanitizeBuildUnitPreviewFields nulls root-relative previewImageUrl", () => {
    expect(sanitizeBuildUnitPreviewFields({ id: "rel", previewImageUrl: "/explore-catalog/ai-chat-interface.svg" }).previewImageUrl).toBeNull();
  });

  it("normalizeApiBuildUnit strips placeholder previewImageUrl at ingest boundary", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw = {
      id: "ingest-1",
      slug: "s",
      title: "T",
      description: null,
      type: "template",
      category: "ui",
      tags: null,
      prompt: null,
      codeSnippet: null,
      previewImageUrl: "/placeholder.svg",
      previewKind: "image",
      previewSnapshotId: null,
      previewFileId: null,
      sourceFileId: null,
      sourceFileName: null,
      sourceFileMime: null,
      sourceFileUrl: null,
      authorUserId: null,
      authorLabel: null,
      visibility: "public",
      sourceKind: "system",
      originalBuildUnitId: null,
      forkable: true,
      downloadable: true,
      verified: false,
      trending: false,
      recommended: false,
      isNew: false,
      accent: null,
      usesCount: 0,
      forksCount: 0,
      downloadsCount: 0,
      metadataJson: null,
      createdAt: "",
      updatedAt: "",
      archivedAt: null
    } as ApiBuildUnit;
    expect(normalizeApiBuildUnit(raw).previewImageUrl).toBeNull();
  });

  it("normalizeApiBuildUnit preserves good previewImageUrl", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw = {
      id: "ingest-2",
      slug: "s",
      title: "T",
      description: null,
      type: "template",
      category: "ui",
      tags: null,
      prompt: null,
      codeSnippet: null,
      previewImageUrl: "https://cdn.example.com/ok.png",
      previewKind: "image",
      previewSnapshotId: null,
      previewFileId: null,
      sourceFileId: null,
      sourceFileName: null,
      sourceFileMime: null,
      sourceFileUrl: null,
      authorUserId: null,
      authorLabel: null,
      visibility: "public",
      sourceKind: "system",
      originalBuildUnitId: null,
      forkable: true,
      downloadable: true,
      verified: false,
      trending: false,
      recommended: false,
      isNew: false,
      accent: null,
      usesCount: 0,
      forksCount: 0,
      downloadsCount: 0,
      metadataJson: null,
      createdAt: "",
      updatedAt: "",
      archivedAt: null
    } as ApiBuildUnit;
    expect(normalizeApiBuildUnit(raw).previewImageUrl).toBe("https://cdn.example.com/ok.png");
  });

  it("devWarnPreviewInvariantViolation only warns for placeholder URLs", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    devWarnPreviewInvariantViolation("t", { unitId: "u", previewImageUrl: "https://good.com/x.png" });
    expect(warn).not.toHaveBeenCalled();
    devWarnPreviewInvariantViolation("t", { unitId: "u", previewImageUrl: "/placeholder.svg" });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("[PreviewInvariantViolation]"),
      expect.objectContaining({ unitId: "u" })
    );
  });

  it("sanitizeBuildUnitPreviewFields warns once per unit in dev when stripping a placeholder", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    sanitizeBuildUnitPreviewFields({ id: "same", previewImageUrl: "/placeholder.svg" });
    sanitizeBuildUnitPreviewFields({ id: "same", previewImageUrl: "/placeholder.svg" });
    const previewViolationCalls = warn.mock.calls.filter((c) => String(c[0]).includes("[PreviewInvariantViolation]"));
    expect(previewViolationCalls.length).toBe(1);
  });

  it("mergePreviewImageUrlWhenSupplementNewer prefers first usable URL", () => {
    expect(
      mergePreviewImageUrlWhenSupplementNewer(
        { previewImageUrl: "/placeholder.svg" },
        { previewImageUrl: "https://cdn.example.com/good.png" }
      )
    ).toBe("https://cdn.example.com/good.png");
    expect(
      mergePreviewImageUrlWhenSupplementNewer(
        { previewImageUrl: "https://cdn.example.com/good.png" },
        { previewImageUrl: "/placeholder.svg" }
      )
    ).toBe("https://cdn.example.com/good.png");
    expect(
      mergePreviewImageUrlWhenSupplementNewer({ previewImageUrl: "/placeholder.svg" }, { previewImageUrl: null })
    ).toBe(null);
    expect(
      mergePreviewImageUrlWhenSupplementNewer(
        { previewImageUrl: "https://cdn.example.com/good.png" },
        { previewImageUrl: "/explore-catalog/stale.svg" }
      )
    ).toBe("https://cdn.example.com/good.png");
  });
});
