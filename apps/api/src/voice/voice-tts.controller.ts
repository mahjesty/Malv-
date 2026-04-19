import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { LocalTtsService } from "./local-tts/local-tts.service";
import { VoiceCatalogService } from "./voice-catalog.service";
import { FfmpegService } from "../modules/voice/services/ffmpeg.service";

@Controller("v1/voice")
export class VoiceTtsController {
  constructor(
    private readonly tts: LocalTtsService,
    private readonly ffmpegService: FfmpegService,
    private readonly voiceCatalog: VoiceCatalogService
  ) {}

  @Get("health")
  @UseGuards(JwtAuthGuard)
  voiceHealth(@Req() req: Request) {
    const auth = (req as any).user as { role?: string } | undefined;
    if (auth?.role !== "admin") return { ok: false, error: "Forbidden" };
    const diag = this.ffmpegService.getDiagnosticsSnapshot();
    return {
      ffmpegAvailable: diag.available,
      ffmpegPath: null,
      resolutionSource: diag.resolutionSource,
      ffmpegExplicitEnvSet: diag.explicitEnvSet
    };
  }

  @Get("voices")
  @UseGuards(JwtAuthGuard)
  voicesCatalog(@Req() req: Request) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) {
      return { ok: false, error: "Unauthorized" };
    }
    const validatePaths = ["1", "true", "yes", "on"].includes(
      (process.env.MALV_VOICE_CATALOG_VALIDATE_PATHS ?? "").trim().toLowerCase()
    );
    const voices = this.voiceCatalog.listVoices(validatePaths).map((v) => ({
      id: v.id,
      displayName: v.displayName,
      provider: v.provider,
      language: v.language ?? null,
      locale: v.locale ?? null,
      personaTags: v.personaTags ?? []
    }));
    return { ok: true, defaultVoiceId: this.voiceCatalog.defaultVoiceId(), voices };
  }

  @Post("tts")
  @UseGuards(JwtAuthGuard)
  async ttsSynthesize(@Req() req: Request, @Body() body: { text: string; voiceId?: string | null }) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) {
      return { ok: false, error: "Unauthorized" };
    }
    const { wavBytes, voiceId } = await this.tts.synthesize({ text: body?.text ?? "", voiceId: body?.voiceId ?? null });
    // Return base64 so the existing `apiFetch` JSON transport can be reused (no extra infra).
    return { ok: true, mimeType: "audio/wav", audioB64: wavBytes.toString("base64"), voiceId };
  }
}

