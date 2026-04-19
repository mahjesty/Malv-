import { ConfigService } from "@nestjs/config";

/** Feature gate — default off for production safety; enable per environment. */
export function malvAgentSystemEnabled(cfg: ConfigService): boolean {
  const v = (cfg.get<string>("MALV_AGENT_SYSTEM_ENABLED") ?? "0").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** When true, Beast chat attaches full router decision to worker context. */
export function malvAgentChatRouterAttachEnabled(cfg: ConfigService): boolean {
  if (!malvAgentSystemEnabled(cfg)) return false;
  const v = (cfg.get<string>("MALV_AGENT_CHAT_ROUTER_CONTEXT") ?? "1").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
