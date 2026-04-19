import { Injectable } from "@nestjs/common";
import { createHash } from "crypto";
import type { MalvPushSendResult, MalvPushTokenRecord } from "./malv-push.types";

@Injectable()
export class MalvPushProviderService {
  async sendNotification(
    tokenRecord: MalvPushTokenRecord,
    payload: { title: string; body?: string | null; data?: Record<string, unknown> | null }
  ): Promise<MalvPushSendResult> {
    const provider = tokenRecord.platform === "android" ? "fcm" : "apns";
    const tokenHash = createHash("sha256").update(tokenRecord.token).digest("hex").slice(0, 12);
    const envEnabled =
      tokenRecord.platform === "android"
        ? process.env.MALV_FCM_ENABLED === "true"
        : process.env.MALV_APNS_ENABLED === "true";

    if (!envEnabled) {
      return {
        ok: false,
        provider,
        platform: tokenRecord.platform,
        tokenHash,
        detail: `${provider}_not_enabled`
      };
    }

    void payload;
    return {
      ok: false,
      provider,
      platform: tokenRecord.platform,
      tokenHash,
      detail: `${provider}_provider_not_wired`
    };
  }
}

