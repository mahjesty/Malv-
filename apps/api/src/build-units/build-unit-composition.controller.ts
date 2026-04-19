import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { IsArray, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from "class-validator";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { BuildUnitService } from "./build-unit.service";

class CreateCompositionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(220)
  name!: string;

  @IsArray()
  @IsString({ each: true })
  unitIds!: string[];

  @IsOptional()
  @IsObject()
  metadataJson?: Record<string, unknown> | null;
}

class UpdateCompositionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(220)
  name!: string;
}

@Controller("v1/workspaces/unit-compositions")
export class BuildUnitCompositionController {
  constructor(private readonly buildUnits: BuildUnitService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Req() req: Request, @Body() body: CreateCompositionDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const composition = await this.buildUnits.createComposition({
      userId:       auth.userId,
      name:         body.name,
      unitIds:      body.unitIds,
      metadataJson: body.metadataJson ?? null
    });
    return { ok: true, composition };
  }

  @Get("mine")
  @UseGuards(JwtAuthGuard)
  async mine(@Req() req: Request) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const compositions = await this.buildUnits.listMyCompositions(auth.userId);
    return { ok: true, compositions };
  }

  // ── GET /v1/workspaces/unit-compositions/:id ─────────────────────────────

  @Get(":id")
  @UseGuards(JwtAuthGuard)
  async getOne(@Req() req: Request, @Param("id") id: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const composition = await this.buildUnits.getComposition(auth.userId, id);
    return { ok: true, composition };
  }

  // ── PATCH /v1/workspaces/unit-compositions/:id ─────────────────────────────

  @Patch(":id")
  @UseGuards(JwtAuthGuard)
  async update(@Req() req: Request, @Param("id") id: string, @Body() body: UpdateCompositionDto) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const composition = await this.buildUnits.updateComposition({
      userId:        auth.userId,
      compositionId: id,
      name:          body.name
    });
    return { ok: true, composition };
  }

  // ── DELETE /v1/workspaces/unit-compositions/:id ────────────────────────────

  @Delete(":id")
  @UseGuards(JwtAuthGuard)
  async remove(@Req() req: Request, @Param("id") id: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    await this.buildUnits.deleteComposition(auth.userId, id);
    return { ok: true };
  }

  // ── POST /v1/workspaces/unit-compositions/:id/send-to-task ────────────────

  @Post(":id/send-to-task")
  @UseGuards(JwtAuthGuard)
  async sendToTask(@Req() req: Request, @Param("id") id: string) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const { task } = await this.buildUnits.sendCompositionToTask(auth.userId, id);
    return { ok: true, task };
  }
}
