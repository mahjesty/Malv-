import crypto from "crypto";

export type KillSwitchEvent = {
  id: string;
  systemOn: boolean;
  previousSystemOn: boolean;
  reason: string;
  actor: string;
  occurredAt: number;
};

export class KillSwitchService {
  private systemOn = true;
  private occurredAt = Date.now();
  private readonly events: KillSwitchEvent[] = [];

  getState() {
    return { systemOn: this.systemOn, occurredAt: this.occurredAt };
  }

  setState(args: { systemOn: boolean; reason: string; actor: string }) {
    const previous = this.systemOn;
    if (previous === args.systemOn) {
      return { changed: false, state: this.getState() };
    }

    this.systemOn = args.systemOn;
    this.occurredAt = Date.now();

    const evt: KillSwitchEvent = {
      id: crypto.randomUUID(),
      systemOn: this.systemOn,
      previousSystemOn: previous,
      reason: args.reason,
      actor: args.actor,
      occurredAt: this.occurredAt
    };
    this.events.unshift(evt);
    return { changed: true, state: this.getState(), event: evt };
  }

  listEvents(limit: number) {
    return this.events.slice(0, limit);
  }
}

