import { Body, Controller, ForbiddenException, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsNumber, IsOptional, Max, Min } from "class-validator";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { DevicesService } from "./devices.service";

class SeedSimulatorDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(6)
  deviceCount?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(16)
  sessionCount?: number;
}

@Controller("v1/devices")
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@Req() req: Request) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const items = await this.devices.listDevices({ userId: auth.userId });
    return { ok: true, devices: items };
  }

  @Get("sessions")
  @UseGuards(JwtAuthGuard)
  async sessions(@Req() req: Request, @Query("limit") limitRaw?: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const limit = Math.min(100, Math.max(1, Number(limitRaw ?? 40)));
    const sessions = await this.devices.listSessions({ userId: auth.userId, limit });
    return { ok: true, sessions };
  }

  /** Production + optional dev-harness visibility (trusted-device bridge contract). */
  @Get("bridge/health")
  @UseGuards(JwtAuthGuard)
  async bridgeHealth(@Req() req: Request) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    return { ok: true, ...this.devices.getBridgeHealth() };
  }

  /** @deprecated Prefer GET /v1/devices/bridge/health — kept for older clients. */
  @Get("simulator/health")
  @UseGuards(JwtAuthGuard)
  async simulatorHealth(@Req() req: Request) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    return { ok: true, ...(this.devices.simulatorHealth() as any) };
  }

  /** Dev-only: seed rows — requires MALV_DEV_HARNESS_ENABLED (not a product feature). */
  @Post("dev-harness/seed")
  @UseGuards(JwtAuthGuard)
  async seedDevHarness(@Req() req: Request, @Body() dto: SeedSimulatorDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const out = await this.devices.seedSimulatorData({
      userId: auth.userId,
      deviceCount: dto.deviceCount,
      sessionCount: dto.sessionCount
    });
    if (!out.devHarnessEnabled) {
      throw new ForbiddenException({
        ok: false,
        error: "Dev harness is disabled.",
        hint: "Set MALV_DEV_HARNESS_ENABLED=true for optional desktop verification only."
      });
    }
    return { ok: true, ...out };
  }

  /** @deprecated Use POST /v1/devices/dev-harness/seed */
  @Post("simulator/seed")
  @UseGuards(JwtAuthGuard)
  async seedSimulator(@Req() req: Request, @Body() dto: SeedSimulatorDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const out = await this.devices.seedSimulatorData({
      userId: auth.userId,
      deviceCount: dto.deviceCount,
      sessionCount: dto.sessionCount
    });
    if (!out.devHarnessEnabled) {
      throw new ForbiddenException({
        ok: false,
        error: "Dev harness is disabled.",
        hint: "Set MALV_DEV_HARNESS_ENABLED=true for optional desktop verification only."
      });
    }
    return { ok: true, ...out };
  }
}
