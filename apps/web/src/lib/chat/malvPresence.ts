import type { MalvChatMessage } from "./types";
import { deriveMalvPresenceAssistantEnergy } from "./malvAssistantUiState";

export type MalvPresencePhase = "idle" | "thinking" | "active";
export type MalvChannelState = "live" | "offline" | "mock";

export type MalvPresenceSnapshot = {
  phase: MalvPresencePhase;
  channel: MalvChannelState;
  /** Top bar — primary operator state */
  headline: string;
  /** Subline — transport / channel */
  detail: string;
};

/**
 * Maps websocket / generation state into a calm operator presence readout.
 */
export function computeMalvPresence(args: {
  generationActive: boolean;
  messages: MalvChatMessage[];
  transportStatus: "idle" | "connected" | "disconnected" | "reconnecting";
  useMock: boolean;
}): MalvPresenceSnapshot {
  const channel: MalvChannelState = args.useMock
    ? "mock"
    : args.transportStatus === "connected"
      ? "live"
      : "offline";

  const energy = deriveMalvPresenceAssistantEnergy({
    generationActive: args.generationActive,
    messages: args.messages
  });
  const phase: MalvPresencePhase = energy === "idle" ? "idle" : energy === "active" ? "active" : "thinking";

  // Chat top bar should stay calm: keep only the product name.
  const headline = "MALV";
  const detail = "";

  return { phase, channel, headline, detail };
}
