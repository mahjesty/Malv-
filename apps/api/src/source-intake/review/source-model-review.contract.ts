/**
 * Contract for future pluggable source model review providers.
 * Implementations must not fabricate findings; callers keep decision/policy on the backend.
 */

export type SourceModelReviewInput = {
  sessionId: string;
  sourceMetadata: {
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
    fileCount?: number;
    extractionMode?: string;
    truncated?: boolean;
  };
  detectionJson?: unknown;
  auditJson?: unknown;
  extractedTextSample?: string;
  extractedFiles?: Array<{
    path: string;
    contentSample?: string;
    truncated?: boolean;
  }>;
};

export type SourceModelReviewOutput = {
  summary?: string;
  capabilitiesDetected?: string[];
  risks?: Array<{
    severity: "low" | "medium" | "high";
    category: string;
    title: string;
    evidence?: string;
    path?: string;
    line?: number;
    implication?: string;
    recommendation?: string;
  }>;
  limitations?: string[];
  confidence?: "low" | "medium" | "high";
};

export interface SourceModelReviewProvider {
  readonly id: string;
  review(input: SourceModelReviewInput): Promise<SourceModelReviewOutput | null>;
}
