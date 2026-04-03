import { MalvChatCciHandoffService } from "./malv-chat-cci-handoff.service";
import { ConfigService } from "@nestjs/config";
import type { CodeChangeIntelligenceService } from "./code-change-intelligence.service";
import type { WorkspaceAccessService } from "../workspace/workspace-access.service";
import type { KillSwitchService } from "../kill-switch/kill-switch.service";

describe("MalvChatCciHandoffService", () => {
  it("returns null when disabled", async () => {
    const svc = new MalvChatCciHandoffService(
      { get: () => "0" } as unknown as ConfigService,
      {} as CodeChangeIntelligenceService,
      { isWorkspaceMember: jest.fn() } as unknown as WorkspaceAccessService,
      { ensureSystemOnOrThrow: jest.fn() } as unknown as KillSwitchService
    );
    expect(svc.isEnabled()).toBe(false);
    const out = await svc.maybeBuildHandoffContext({
      userId: "u1",
      userRole: "user",
      workspaceId: "ws1",
      message: "fix bug",
      assistantMessageId: "m1",
      primaryIntent: "bug_fix"
    });
    expect(out).toBeNull();
  });

  it("maps primary intents for handoff", () => {
    const svc = new MalvChatCciHandoffService(
      { get: () => "1" } as unknown as ConfigService,
      {} as CodeChangeIntelligenceService,
      {} as unknown as WorkspaceAccessService,
      {} as unknown as KillSwitchService
    );
    expect(svc.shouldOfferHandoff("bug_fix")).toBe(true);
    expect(svc.shouldOfferHandoff("unknown_intent")).toBe(false);
  });
});
