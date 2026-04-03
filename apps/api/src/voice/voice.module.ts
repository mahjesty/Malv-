import { existsSync } from "node:fs";
import { forwardRef, Logger, Module, OnModuleInit } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { VoiceOperatorService } from "./voice-operator.service";
import { VoiceSttSessionService } from "./voice-stt-session.service";
import { LocalSttService } from "./local-stt/local-stt.service";
import { LocalTtsService } from "./local-tts/local-tts.service";
import { VoiceTtsController } from "./voice-tts.controller";
import { VoiceTestTriggerController } from "./voice-test-trigger.controller";
import { VoicePlaybackService } from "./voice-playback.service";
import { SpeechToTextService } from "./speech-to-text.service";
import { VoiceTriggerService } from "./voice-trigger.service";
import { VoiceTestTriggerService } from "./voice-test-trigger.service";
import { AuthModule } from "../auth/auth.module";
import { KillSwitchModule } from "../kill-switch/kill-switch.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { BeastModule } from "../beast/beast.module";
import { SandboxModule } from "../sandbox/sandbox.module";
import { AiJobEntity } from "../db/entities/ai-job.entity";
import { VoiceOperatorEventEntity } from "../db/entities/voice-operator-event.entity";
import { ReviewSessionEntity } from "../db/entities/review-session.entity";
import { ReviewFindingEntity } from "../db/entities/review-finding.entity";
import { OperatorTargetEntity } from "../db/entities/operator-target.entity";
import { FfmpegNotFoundError, FfmpegService } from "../modules/voice/services/ffmpeg.service";
import { CallsModule } from "../calls/calls.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([AiJobEntity, VoiceOperatorEventEntity, ReviewSessionEntity, ReviewFindingEntity, OperatorTargetEntity]),
    forwardRef(() => AuthModule),
    KillSwitchModule,
    forwardRef(() => CallsModule),
    forwardRef(() => RealtimeModule),
    forwardRef(() => BeastModule),
    forwardRef(() => SandboxModule)
  ],
  controllers: [VoiceTtsController, VoiceTestTriggerController],
  providers: [
    VoiceOperatorService,
    VoiceSttSessionService,
    VoicePlaybackService,
    SpeechToTextService,
    VoiceTriggerService,
    VoiceTestTriggerService,
    LocalSttService,
    LocalTtsService,
    FfmpegService
  ],
  exports: [
    VoiceOperatorService,
    VoiceSttSessionService,
    VoicePlaybackService,
    SpeechToTextService,
    VoiceTriggerService,
    LocalSttService,
    LocalTtsService,
    FfmpegService
  ]
})
export class VoiceModule implements OnModuleInit {
  private readonly logger = new Logger(VoiceModule.name);
  private voiceAvailable = true;

  constructor(private readonly ffmpegService: FfmpegService) {}

  onModuleInit() {
    const diag = this.ffmpegService.getDiagnosticsSnapshot();
    this.logger.log(
      `[malv-voice] runtime voice init cwd=${diag.cwd} ffmpegExplicitEnv=${diag.explicitEnvSet ? "FFMPEG_PATH" : "unset"}`
    );
    this.logger.log(`[malv-voice] runtime PATH (Node process)=${diag.pathEnv}`);

    try {
      const path = this.ffmpegService.getFfmpegPath();
      this.voiceAvailable = true;
      const snap = this.ffmpegService.getDiagnosticsSnapshot();
      this.logger.log(
        `[malv-voice] ffmpeg resolved path=${path} source=${snap.resolutionSource ?? "unknown"} (explicit override=${snap.explicitEnvSet})`
      );
    } catch (err) {
      this.voiceAvailable = false;
      if (err instanceof FfmpegNotFoundError) {
        const d = err.diagnostics;
        this.logger.error("[malv-voice] ffmpeg not found in runtime (Node process)", {
          cwd: d.cwd,
          PATH: d.pathEnv,
          explicitFFMPEG_PATH: process.env.FFMPEG_PATH ?? null,
          attemptedLocations: err.attemptedLocations
        });
      } else {
        this.logger.error("[malv-voice] ffmpeg resolution failed unexpectedly", err);
      }
    }

    const sttProvider = (process.env.MALV_LOCAL_STT_PROVIDER ?? "whisper_cpp").toLowerCase();
    const whisperBin = process.env.WHISPER_CPP_BIN?.trim();
    const whisperModel = process.env.WHISPER_CPP_MODEL?.trim();
    if (sttProvider === "whisper_cpp") {
      if (!whisperBin || !whisperModel) {
        this.logger.warn(
          "[malv-voice] local STT: set WHISPER_CPP_BIN and WHISPER_CPP_MODEL (transcription returns STT_UNAVAILABLE until both are set)"
        );
      } else {
        const modelReadable = existsSync(whisperModel);
        this.logger.log(
          `[malv-voice] local STT startup: provider=whisper_cpp bin=${whisperBin} model=${whisperModel} modelReadable=${modelReadable}`
        );
      }
    }
  }

  isVoiceAvailable() {
    return this.voiceAvailable;
  }
}

