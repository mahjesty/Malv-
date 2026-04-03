import { Controller, Get, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { ObservabilityService } from "./observability.service";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

@Controller("v1")
export class MetricsController {
  constructor(private readonly observability: ObservabilityService) {}

  @Get("metrics")
  @UseGuards(JwtAuthGuard)
  async metrics(@Req() req: Request, @Res() res: Response) {
    const auth = (req as any).user as { role?: string } | undefined;
    if (auth?.role !== "admin") {
      res.status(403).send("forbidden");
      return;
    }
    const contentType = await this.observability.metricsContentType();
    const body = await this.observability.renderPrometheus();
    res.setHeader("Content-Type", contentType);
    res.status(200).send(body);
  }
}
