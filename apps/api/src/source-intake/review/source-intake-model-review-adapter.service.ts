import { Injectable, Logger } from "@nestjs/common";
import { loadSourceModelReviewConfigFromEnv } from "./source-model-review.config";
import type { SourceModelReviewInput, SourceModelReviewOutput, SourceModelReviewProvider } from "./source-model-review.contract";

/**
 * Nest entry point for optional model-assisted enrichment.
 * When disabled or no provider is registered, returns null without touching audit outcomes.
 */
@Injectable()
export class SourceIntakeModelReviewAdapterService {
  private readonly logger = new Logger(SourceIntakeModelReviewAdapterService.name);

  private readonly providers = new Map<string, SourceModelReviewProvider>();

  registerProvider(p: SourceModelReviewProvider): void {
    this.providers.set(p.id, p);
  }

  async maybeEnrichReview(input: SourceModelReviewInput): Promise<SourceModelReviewOutput | null> {
    const cfg = loadSourceModelReviewConfigFromEnv();
    if (!cfg.enabled) {
      return null;
    }
    if (!cfg.providerId) {
      this.logger.warn("SOURCE_MODEL_REVIEW_ENABLED is true but SOURCE_MODEL_REVIEW_PROVIDER is unset — skipping model review.");
      return null;
    }
    const provider = this.providers.get(cfg.providerId);
    if (!provider) {
      this.logger.warn(
        `No SourceModelReviewProvider registered for SOURCE_MODEL_REVIEW_PROVIDER=${cfg.providerId} — skipping model review.`
      );
      return null;
    }
    try {
      return await provider.review(input);
    } catch (e) {
      this.logger.warn(`Model review provider threw; continuing static-only: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }
}
