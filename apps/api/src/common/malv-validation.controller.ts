import { Controller, Get, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { MalvValidationTelemetryService } from "./malv-validation-telemetry.service";
import { ConfigService } from "@nestjs/config";
import { malvValidationModeEnabled } from "./malv-validation-flags.util";

@Controller("v1/admin/malv-validation")
export class MalvValidationController {
  constructor(
    private readonly telemetry: MalvValidationTelemetryService,
    private readonly cfg: ConfigService
  ) {}

  @Get("summary")
  @UseGuards(JwtAuthGuard)
  summary(@Req() req: Request, @Res() res: Response) {
    const auth = (req as any).user as { role?: string } | undefined;
    if (auth?.role !== "admin") {
      res.status(403).send("forbidden");
      return;
    }
    if (!malvValidationModeEnabled((k) => this.cfg.get<string>(k))) {
      res.status(404).send("validation_mode_disabled");
      return;
    }
    res.status(200).json(this.telemetry.getSummary());
  }
}
