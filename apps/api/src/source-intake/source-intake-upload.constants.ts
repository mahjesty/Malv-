import {
  BUILD_UNIT_SOURCE_EXTENSIONS,
  BUILD_UNIT_SOURCE_MIMES,
  extFromName,
  normalizeMime
} from "../build-units/build-unit-upload.constants";

/** Intake archives and source may be larger than a single snippet file. */
export const SOURCE_INTAKE_MAX_BYTES = 20 * 1024 * 1024;

const INTAKE_ZIP_MIMES = new Set(["application/zip", "application/x-zip-compressed"]);

export function assertSourceIntakeUploadAllowed(args: {
  mimeType: string | null | undefined;
  originalName: string;
  sizeBytes: number;
}): void {
  if (args.sizeBytes > SOURCE_INTAKE_MAX_BYTES) {
    throw new Error(`Source intake exceeds ${SOURCE_INTAKE_MAX_BYTES} bytes.`);
  }
  const m = normalizeMime(args.mimeType);
  const ext = extFromName(args.originalName);
  if (ext === "zip" || (m && INTAKE_ZIP_MIMES.has(m))) {
    return;
  }
  const mimeOk = Boolean(m && BUILD_UNIT_SOURCE_MIMES.has(m));
  const extOk = Boolean(ext && BUILD_UNIT_SOURCE_EXTENSIONS.has(ext));
  if (!mimeOk && !extOk) {
    throw new Error(
      "Upload a .zip archive or a supported source file (js, ts, tsx, html, css, json, txt, md)."
    );
  }
}
