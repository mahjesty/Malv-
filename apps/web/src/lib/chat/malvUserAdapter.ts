type MalvErrorLike = {
  code?: string;
  message?: string;
};

/**
 * Maps internal orchestration/runtime errors into product-safe user copy.
 * Keep technical details in logs or privileged diagnostic views only.
 */
export function mapMalvErrorToUserMessage(err: MalvErrorLike): string {
  const code = err.code;

  switch (code) {
    case "ack_timeout":
      return "Connection lost. Reconnect and try again.";
    case "job_failed":
      return "MALV is temporarily unavailable.";
    case "mock_error":
    case "mock_failed":
      return "Practice mode had trouble completing that turn.";
    case "send_failed":
      return "Request could not be completed. Please try again.";
    case "no_token":
      return "Please sign in again to continue.";
    case "mock_failed_http":
      return "Practice mode had trouble completing that turn.";
    default:
      // If we don't recognize the shape/code, fall back to a safe generic message.
      return "MALV is temporarily unavailable.";
  }
}

export function mapApprovalRequiredToUserMessage(): string {
  return "MALV isn't ready right now. Please try again shortly.";
}

export function mapGenerationWatchdogToUserMessage(): string {
  return "MALV is taking longer than expected. Please try again.";
}

