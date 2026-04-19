import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ExploreImageGenerateDto } from "./dto/explore-image-generate.dto";
import { ImageGenerationService } from "./image-generation.service";

@Controller("v1/explore/image")
export class ExploreImageController {
  constructor(private readonly imageGeneration: ImageGenerationService) {}

  @Post("generate")
  @UseGuards(JwtAuthGuard)
  async generate(@Req() req: Request, @Body() body: ExploreImageGenerateDto) {
    const auth = (req as { user?: { userId?: string } }).user;
    const userId = auth?.userId?.trim() ?? "";
    const result = await this.imageGeneration.generate(body.prompt, undefined, {
      sourceImageDataUrl: body.sourceImageDataUrl,
      sourceImageFileId: body.sourceImageFileId,
      modeId: body.modeId,
      userId: userId || undefined,
      promptExpansionMode: body.promptExpansionMode ?? null
    });

    return {
      status: result.status,
      interpretation: result.interpretation,
      imageUrl: result.imageUrl,
      logs: result.logs,
      plan: result.plan,
      directionSummary: result.directionSummary
    };
  }
}
