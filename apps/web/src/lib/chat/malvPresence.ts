import type { MalvChatMessage } from "./types";

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

  let phase: MalvPresencePhase = "idle";
  if (args.generationActive) {
    const la = [...args.messages].reverse().find((m) => m.role === "assistant");
    phase = la?.status === "streaming" ? "active" : "thinking";
  }

  // Chat top bar should stay calm: keep only the product name.
  const headline = "MALV";
  const detail = "";

  return { phase, channel, headline, detail };
}
