import { Test } from "@nestjs/testing";
import { SourceIntakeModelReviewAdapterService } from "./source-intake-model-review-adapter.service";
import type { SourceModelReviewProvider } from "./source-model-review.contract";

describe("SourceIntakeModelReviewAdapterService", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("returns null when SOURCE_MODEL_REVIEW_ENABLED is unset/false", async () => {
    delete process.env.SOURCE_MODEL_REVIEW_ENABLED;
    const m = await Test.createTestingModule({
      providers: [SourceIntakeModelReviewAdapterService]
    }).compile();
    const svc = m.get(SourceIntakeModelReviewAdapterService);
    expect(await svc.maybeEnrichReview({ sessionId: "s", sourceMetadata: {} })).toBeNull();
  });

  it("returns null when enabled but provider id missing", async () => {
    process.env.SOURCE_MODEL_REVIEW_ENABLED = "true";
    delete process.env.SOURCE_MODEL_REVIEW_PROVIDER;
    const m = await Test.createTestingModule({
      providers: [SourceIntakeModelReviewAdapterService]
    }).compile();
    const svc = m.get(SourceIntakeModelReviewAdapterService);
    expect(await svc.maybeEnrichReview({ sessionId: "s", sourceMetadata: {} })).toBeNull();
  });

  it("returns null when enabled but provider not registered", async () => {
    process.env.SOURCE_MODEL_REVIEW_ENABLED = "true";
    process.env.SOURCE_MODEL_REVIEW_PROVIDER = "noop";
    const m = await Test.createTestingModule({
      providers: [SourceIntakeModelReviewAdapterService]
    }).compile();
    const svc = m.get(SourceIntakeModelReviewAdapterService);
    expect(await svc.maybeEnrichReview({ sessionId: "s", sourceMetadata: {} })).toBeNull();
  });

  it("invokes registered provider when enabled", async () => {
    process.env.SOURCE_MODEL_REVIEW_ENABLED = "true";
    process.env.SOURCE_MODEL_REVIEW_PROVIDER = "test";
    const provider: SourceModelReviewProvider = {
      id: "test",
      review: async () => ({ summary: "from provider" })
    };
    const m = await Test.createTestingModule({
      providers: [SourceIntakeModelReviewAdapterService]
    }).compile();
    const svc = m.get(SourceIntakeModelReviewAdapterService);
    svc.registerProvider(provider);
    const out = await svc.maybeEnrichReview({ sessionId: "s", sourceMetadata: {} });
    expect(out?.summary).toBe("from provider");
  });
});
