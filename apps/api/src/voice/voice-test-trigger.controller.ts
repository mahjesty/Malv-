import {
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException
} from "@nestjs/common";
import type { Request } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { VoiceTestTriggerService } from "./voice-test-trigger.service";

type AuthedRequest = Request & { user?: { userId: string } };

@Controller("v1/voice")
export class VoiceTestTriggerController {
  constructor(private readonly voiceTestTrigger: VoiceTestTriggerService) {}

  /**
   * One-shot: recorded utterance → local STT → trigger match → canned reply + playable audio (TTS or static URL).
   * Does not use WebRTC or voice socket chunking.
   */
  @Post("test-trigger")
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor("audio", { limits: { fileSize: 12 * 1024 * 1024 } }))
  async postTestTrigger(@Req() req: AuthedRequest, @UploadedFile() file?: { buffer: Buffer; mimetype?: string }) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new BadRequestException("Unauthorized");
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException("audio file required (field name: audio)");
    }
    const mimeType = file.mimetype || "audio/webm";
    const rawCall = (req.body as { callSessionId?: unknown })?.callSessionId;
    const callSessionId = typeof rawCall === "string" ? rawCall : undefined;
    return this.voiceTestTrigger.run({
      userId,
      audioBytes: file.buffer,
      mimeType,
      callSessionId: callSessionId ?? null
    });
  }
}
