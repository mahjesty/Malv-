import type { MalvDevicePlatform } from "./malv-device-platform.types";

export type MalvPushPlatform = Extract<MalvDevicePlatform, "android" | "ios">;

export type MalvPushTokenRecord = {
  userId: string;
  deviceId: string;
  platform: MalvPushPlatform;
  token: string;
  registeredAt: string;
};

export type MalvPushSendResult = {
  ok: boolean;
  provider: "fcm" | "apns";
  platform: MalvPushPlatform;
  tokenHash: string;
  detail?: string;
};

