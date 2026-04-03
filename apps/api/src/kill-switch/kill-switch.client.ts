import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type SupervisorKillSwitchState = {
  systemOn: boolean;
  occurredAt: number;
};

export type SupervisorKillSwitchEvent = {
  id: string;
  systemOn: boolean;
  previousSystemOn: boolean;
  reason: string;
  actor: string;
  occurredAt: number;
};

@Injectable()
export class KillSwitchClient {
  constructor(private readonly cfg: ConfigService) {}

  private getBaseUrl() {
    return this.cfg.get<string>("SUPERVISOR_BASE_URL") ?? "http://127.0.0.1:8090";
  }

  private getSecret() {
    return this.cfg.get<string>("INTERNAL_SHARED_SECRET") ?? "";
  }

  async fetchState(): Promise<SupervisorKillSwitchState> {
    const res = await fetch(`${this.getBaseUrl()}/v1/kill-switch/state`, {
      headers: this.getSecret() ? { "x-internal-secret": this.getSecret() } : {}
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || `Kill-switch state HTTP ${res.status}`);
    }
    return (await res.json()) as SupervisorKillSwitchState;
  }

  async fetchRecentEvents(limit: number): Promise<SupervisorKillSwitchEvent[]> {
    const res = await fetch(`${this.getBaseUrl()}/v1/kill-switch/events`, {
      headers: this.getSecret() ? { "x-internal-secret": this.getSecret() } : {}
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || `Kill-switch events HTTP ${res.status}`);
    }
    const evts = (await res.json()) as SupervisorKillSwitchEvent[];
    return limit ? evts.slice(0, limit) : evts;
  }
}

