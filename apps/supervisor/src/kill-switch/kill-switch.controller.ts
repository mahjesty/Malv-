import { Body, Controller, Get, Headers, Post, UnauthorizedException } from "@nestjs/common";
import { KillSwitchService } from "./kill-switch.service";

type SetKillSwitchBody = {
  systemOn: boolean;
  reason: string;
  actor: string;
};

@Controller("v1/kill-switch")
export class KillSwitchController {
  constructor(private readonly kill: KillSwitchService) {}

  private requireSecret(xInternalSecret?: string) {
    const expected = process.env.INTERNAL_SHARED_SECRET ?? "";
    if (!expected) return true; // dev fallback
    if (!xInternalSecret || xInternalSecret !== expected) {
      throw new UnauthorizedException("Invalid internal secret.");
    }
    return true;
  }

  @Get("state")
  getState(@Headers("x-internal-secret") internal?: string) {
    this.requireSecret(internal);
    return this.kill.getState();
  }

  @Get("events")
  getEvents(@Headers("x-internal-secret") internal?: string) {
    this.requireSecret(internal);
    return this.kill.listEvents(50);
  }

  @Post("admin/set")
  setState(@Headers("x-malv-admin-secret") adminSecret?: string, @Body() body?: SetKillSwitchBody) {
    // Admin controls are still enforced by the supervisor boundary.
    const expected = process.env.INTERNAL_SHARED_SECRET ?? "";
    if (expected) {
      if (!adminSecret || adminSecret !== expected) {
        throw new UnauthorizedException("Invalid admin secret.");
      }
    }

    const systemOn = Boolean(body?.systemOn);
    const reason = (body?.reason ?? "no-reason").toString();
    const actor = (body?.actor ?? "admin").toString();
    return this.kill.setState({ systemOn, reason, actor });
  }
}

