import { Injectable, OnModuleInit } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import type { MalvAgentCapability, MalvAgentKind } from "../contracts/malv-agent.contracts";
import { MALV_ALL_REGISTERED_AGENT_PROVIDERS } from "../malv-agent-system.providers";
import type { MalvAgentContract } from "../foundation/malv-base-agent";
import { MALV_AGENT_CAPABILITY_CATALOG } from "./malv-agent-capability-catalog";

/**
 * Discovers agents via Nest DI — register new agent classes in {@link MALV_ALL_REGISTERED_AGENT_PROVIDERS}.
 */
@Injectable()
export class MalvAgentRegistryService implements OnModuleInit {
  private readonly byKind = new Map<MalvAgentKind, MalvAgentContract>();

  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit() {
    for (const cls of MALV_ALL_REGISTERED_AGENT_PROVIDERS) {
      const inst = this.moduleRef.get(cls, { strict: false }) as MalvAgentContract;
      this.byKind.set(inst.identity.kind, inst);
    }
  }

  get(kind: MalvAgentKind): MalvAgentContract | undefined {
    return this.byKind.get(kind);
  }

  all(): MalvAgentContract[] {
    return [...this.byKind.values()];
  }

  /** Deterministic capability match — tag overlap score. */
  matchByTags(requiredTags: string[]): MalvAgentKind[] {
    const req = new Set(requiredTags.map((t) => t.toLowerCase()));
    if (req.size === 0) return [];
    const scored: Array<{ kind: MalvAgentKind; score: number }> = [];
    for (const kind of this.byKind.keys()) {
      const caps = MALV_AGENT_CAPABILITY_CATALOG[kind] ?? [];
      let score = 0;
      for (const c of caps) {
        for (const t of c.tags) {
          if (req.has(t.toLowerCase())) score += 1;
        }
      }
      if (score > 0) scored.push({ kind, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.kind);
  }

  capabilitiesFor(kind: MalvAgentKind): MalvAgentCapability[] {
    return MALV_AGENT_CAPABILITY_CATALOG[kind] ?? [];
  }
}
