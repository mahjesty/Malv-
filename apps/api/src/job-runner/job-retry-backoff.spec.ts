/**
 * Mirrors `BackgroundJobRunnerService` multimodal retry backoff (attempt index = current attemptCount before increment).
 * Keeps formula verified without booting Nest or MySQL.
 */
function multimodalRetryBackoffMs(attemptsBeforeFailure: number): number {
  return Math.min(300_000, 2000 * Math.pow(2, attemptsBeforeFailure));
}

describe("Job retry / backoff (multimodal path)", () => {
  it("uses exponential backoff capped at 5 minutes", () => {
    expect(multimodalRetryBackoffMs(0)).toBe(2000);
    expect(multimodalRetryBackoffMs(1)).toBe(4000);
    expect(multimodalRetryBackoffMs(2)).toBe(8000);
    expect(multimodalRetryBackoffMs(10)).toBe(300_000);
  });
});
