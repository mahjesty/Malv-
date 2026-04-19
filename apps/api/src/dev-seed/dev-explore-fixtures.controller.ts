import { Controller, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { DevExploreFixturesGuard } from "./dev-explore-fixtures.guard";
import { DevExploreFixturesService } from "./dev-explore-fixtures.service";
import { attachBuildUnitPreviewFeasibility, attachSourceIntakePreviewFeasibility, livePreviewPipelineV1FromEnv } from "../preview-feasibility/preview-feasibility.attach";
import { LivePreviewDeliveryService } from "../build-units/live-preview-delivery.service";
import { withPreviewPipelineStatus } from "../build-units/preview-pipeline-status.util";

@Controller("v1/dev/explore-fixtures")
@UseGuards(JwtAuthGuard, DevExploreFixturesGuard)
export class DevExploreFixturesController {
  constructor(
    private readonly fixtures: DevExploreFixturesService,
    private readonly livePreviewDelivery: LivePreviewDeliveryService
  ) {}

  /** Path A — user build unit with code preview fallback (My Units). */
  @Post("landing-published-unit")
  async seedPublishedUnit(@Req() req: Request) {
    const auth = (req as any).user as { userId: string; role?: string } | undefined;
    if (!auth?.userId) return { ok: false as const, error: "Unauthorized" };
    const { unit } = await this.fixtures.seedLandingPublishedUnit(auth.userId, auth.role);
    const pipe = livePreviewPipelineV1FromEnv();
    const withF = attachBuildUnitPreviewFeasibility(unit, pipe);
    const out = withPreviewPipelineStatus(await this.livePreviewDelivery.attachToBuildUnitResponse(auth.userId, withF));
    return { ok: true as const, unit: out };
  }

  /** Path B — terminal approved intake session (Import flow / publish). */
  @Post("landing-source-intake")
  async seedSourceIntake(@Req() req: Request) {
    const auth = (req as any).user as { userId: string; role?: string } | undefined;
    if (!auth?.userId) return { ok: false as const, error: "Unauthorized" };
    const { session } = await this.fixtures.seedLandingSourceIntake(auth.userId, auth.role);
    return { ok: true as const, session: attachSourceIntakePreviewFeasibility(session) };
  }
}
