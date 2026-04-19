import type { ExtractedSourceFile, FullStaticIntakeResult } from "../source-intake-static-audit.util";
import type { SourceModelReviewInput } from "./source-model-review.contract";
import { loadSourceModelReviewConfigFromEnv } from "./source-model-review.config";

function truncate(s: string, max: number): { text: string; truncated: boolean } {
  if (s.length <= max) return { text: s, truncated: false };
  return { text: s.slice(0, max), truncated: true };
}

/**
 * Builds bounded context for a future model provider without loading full archives into prompts by default.
 */
export function buildSourceModelReviewInput(args: {
  sessionId: string;
  originalName: string;
  mimeType?: string | null;
  sizeBytes: number;
  analysis: FullStaticIntakeResult;
  extractedSources: ExtractedSourceFile[];
}): SourceModelReviewInput {
  const cfg = loadSourceModelReviewConfigFromEnv();
  const maxText = cfg.maxTextBytes;
  const maxFiles = cfg.maxFiles;

  const det = args.analysis.detectionJson;
  const fileCount = typeof det.fileCount === "number" ? det.fileCount : args.extractedSources.length;

  const files: NonNullable<SourceModelReviewInput["extractedFiles"]> = [];
  let budget = maxText;
  for (const s of args.extractedSources.slice(0, maxFiles)) {
    if (budget <= 0) break;
    const t = truncate(s.content, Math.min(budget, maxText));
    files.push({
      path: s.path,
      contentSample: t.text,
      truncated: t.truncated
    });
    budget -= t.text.length;
  }

  const firstSample = args.extractedSources[0]?.content ?? "";
  const head = truncate(firstSample, Math.min(maxText, 8192));

  return {
    sessionId: args.sessionId,
    sourceMetadata: {
      fileName: args.originalName,
      mimeType: args.mimeType ?? undefined,
      sizeBytes: args.sizeBytes,
      fileCount,
      extractionMode: args.extractedSources.length > 1 || args.originalName.toLowerCase().endsWith(".zip") ? "archive" : "single_file",
      truncated: Boolean(det.scanTruncated) || files.some((f) => f.truncated)
    },
    detectionJson: args.analysis.detectionJson,
    auditJson: {
      scannerVersion: args.analysis.auditJsonBase.scannerVersion,
      checklist: args.analysis.auditJsonBase.checklist,
      findingsCount: args.analysis.findings.length
    },
    extractedTextSample: head.text || undefined,
    extractedFiles: files.length ? files : undefined
  };
}
