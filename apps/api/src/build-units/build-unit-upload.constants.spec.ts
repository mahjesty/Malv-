import {
  assertPreviewUploadAllowed,
  assertSourceUploadAllowed,
  normalizeMime
} from "./build-unit-upload.constants";

describe("build-unit-upload.constants", () => {
  it("normalizeMime maps jpg to jpeg", () => {
    expect(normalizeMime("image/jpg")).toBe("image/jpeg");
  });

  it("assertPreviewUploadAllowed accepts webp within limit", () => {
    expect(() =>
      assertPreviewUploadAllowed({ mimeType: "image/webp", sizeBytes: 1024 })
    ).not.toThrow();
  });

  it("assertPreviewUploadAllowed rejects wrong mime", () => {
    expect(() =>
      assertPreviewUploadAllowed({ mimeType: "application/pdf", sizeBytes: 100 })
    ).toThrow(/PNG|JPEG|WebP|HTML/i);
  });

  it("assertPreviewUploadAllowed accepts text/html within limit", () => {
    expect(() =>
      assertPreviewUploadAllowed({ mimeType: "text/html", sizeBytes: 100 })
    ).not.toThrow();
  });

  it("assertSourceUploadAllowed accepts ts by extension when mime is generic", () => {
    expect(() =>
      assertSourceUploadAllowed({
        mimeType:     "application/octet-stream",
        originalName: "app.tsx",
        sizeBytes:    50
      })
    ).not.toThrow();
  });

  it("assertSourceUploadAllowed rejects binary-looking name and mime", () => {
    expect(() =>
      assertSourceUploadAllowed({
        mimeType:     "application/octet-stream",
        originalName: "binary.exe",
        sizeBytes:    50
      })
    ).toThrow();
  });
});
