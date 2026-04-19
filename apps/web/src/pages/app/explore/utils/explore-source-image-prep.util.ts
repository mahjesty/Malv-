/** Keep JSON payloads small; staged upload uses the prepared `File`. */
export const EXPLORE_IMAGE_MAX_DATA_URL_CHARS = 1_350_000;

const MAX_LONG_SIDE = 2048;
const JPEG_QUALITY = 0.88;
const MAX_INPUT_BYTES = 48 * 1024 * 1024;

function loadHtmlImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(Object.assign(new Error("Unsupported or corrupt image"), { code: "UNSUPPORTED_IMAGE" as const }));
    img.src = dataUrl;
  });
}

async function bitmapToJpegFileAndPreview(
  bitmap: ImageBitmap,
  baseName: string
): Promise<{ previewDataUrl: string; uploadFile: File; sourceWidth: number; sourceHeight: number }> {
  const sourceWidth = bitmap.width;
  const sourceHeight = bitmap.height;
  let { width, height } = bitmap;
  const scale = Math.min(1, MAX_LONG_SIDE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Image encode failed"))),
      "image/jpeg",
      JPEG_QUALITY
    );
  });
  const safeName = baseName.replace(/\.[^.]+$/, "") || "photo";
  const uploadFile = new File([blob], `${safeName}-malv.jpg`, { type: "image/jpeg" });
  const previewDataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(new Error("read"));
    r.readAsDataURL(blob);
  });
  return { previewDataUrl, uploadFile, sourceWidth, sourceHeight };
}

/**
 * Resize/compress a user pick for explore transforms: bounded dimensions + JPEG for staging upload.
 */
export async function prepareExploreSourceImage(
  file: File
): Promise<{ previewDataUrl: string; uploadFile: File; sourceWidth: number; sourceHeight: number }> {
  if (file.size > MAX_INPUT_BYTES) {
    throw Object.assign(new Error("File too large"), { code: "FILE_TOO_LARGE" as const });
  }
  try {
    const bitmap = await createImageBitmap(file);
    return bitmapToJpegFileAndPreview(bitmap, file.name || "upload");
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "FILE_TOO_LARGE") throw e;
    throw Object.assign(new Error("Could not decode image"), { code: "UNSUPPORTED_IMAGE" as const });
  }
}

/**
 * If a data URL is huge (e.g. pasted source), downscale before POSTing inline.
 */
export async function shrinkExploreImageDataUrlIfNeeded(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:image/") || dataUrl.length <= EXPLORE_IMAGE_MAX_DATA_URL_CHARS) {
    return dataUrl;
  }
  const img = await loadHtmlImage(dataUrl);
  const bitmap = await createImageBitmap(img);
  const out = await bitmapToJpegFileAndPreview(bitmap, "source");
  return out.previewDataUrl;
}

export function exploreSourcePrepareErrorMessage(code: string | undefined): string {
  if (code === "FILE_TOO_LARGE") {
    return "That file is too large to open here. Try a photo under ~48MB or export a smaller copy.";
  }
  if (code === "UNSUPPORTED_IMAGE") {
    return "This format could not be read. Try JPEG, PNG, or WebP from your camera roll.";
  }
  return "Could not prepare that image. Try another file.";
}
