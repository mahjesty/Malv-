import { Injectable } from "@nestjs/common";
import type { DeviceIntelligenceLayerOutput, MetaRouterInput } from "../meta-intelligence.types";

@Injectable()
export class BridgeRoutingService {
  analyze(input: MetaRouterInput, target: DeviceIntelligenceLayerOutput["executionTarget"]): DeviceIntelligenceLayerOutput["bridgeRoute"] {
    const available = new Set(input.bridgeAvailability ?? []);
    if (target === "phone" && available.has("mobile_agent")) return "mobile_agent";
    if (target === "phone" && available.has("desktop_agent")) return "desktop_agent";
    if (target === "desktop" && available.has("desktop_agent")) return "desktop_agent";
    if (target === "desktop" && available.has("browser_agent")) return "browser_agent";
    if (target === "browser" && available.has("browser_agent")) return "browser_agent";
    if (target === "browser" && available.has("desktop_agent")) return "desktop_agent";
    if (target === "home_device" && available.has("home_assistant_bridge")) return "home_assistant_bridge";
    if (target === "multi_target") return available.size > 0 ? "multi_bridge" : "none";
    return "none";
  }
}
