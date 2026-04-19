import { Injectable } from "@nestjs/common";
import type { MalvPushPlatform, MalvPushTokenRecord } from "./malv-push.types";

@Injectable()
export class MalvPushTokenRegistryService {
  private readonly records = new Map<string, MalvPushTokenRecord>();

  private key(userId: string, deviceId: string): string {
    return `${userId}:${deviceId}`;
  }

  register(args: { userId: string; deviceId: string; platform: MalvPushPlatform; token: string }): void {
    const userId = args.userId.trim();
    const deviceId = args.deviceId.trim().slice(0, 128);
    const token = args.token.trim();
    if (!userId || !deviceId || !token) return;
    this.records.set(this.key(userId, deviceId), {
      userId,
      deviceId,
      platform: args.platform,
      token,
      registeredAt: new Date().toISOString()
    });
  }

  unregister(userId: string, deviceId: string): void {
    this.records.delete(this.key(userId.trim(), deviceId.trim()));
  }

  tokensForUser(userId: string, platform?: MalvPushPlatform): MalvPushTokenRecord[] {
    const id = userId.trim();
    const out: MalvPushTokenRecord[] = [];
    for (const record of this.records.values()) {
      if (record.userId !== id) continue;
      if (platform && record.platform !== platform) continue;
      out.push(record);
    }
    return out;
  }

  tokenState(userId: string, platform: MalvPushPlatform): { supported: true; tokenRegistered: boolean; count: number } {
    const count = this.tokensForUser(userId, platform).length;
    return { supported: true, tokenRegistered: count > 0, count };
  }
}

