import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from "class-validator";

export class ChatRequestDto {
  @IsOptional()
  @IsString()
  conversationId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== "")
  @IsUUID()
  workspaceId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== "")
  @IsUUID()
  assistantMessageId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== "")
  @IsUUID()
  vaultSessionId?: string | null;

  @IsOptional()
  @IsIn(["Passive", "Smart", "Advanced", "Beast"])
  beastLevel?: "Passive" | "Smart" | "Advanced" | "Beast";

  @IsOptional()
  @IsIn(["text", "voice", "video"])
  inputMode?: "text" | "voice" | "video";

  @IsOptional()
  @IsString()
  sessionType?: string | null;

  @IsOptional()
  @IsString()
  callId?: string | null;

  /** When set, biases mode router toward operator workflow (same as WS `chat:send`). */
  @IsOptional()
  @IsString()
  operatorPhase?: string | null;

  /** Phase 5 — optional mood nudge (merged with text-derived tone). */
  @IsOptional()
  @IsIn(["stressed", "calm", "urgent", "focused", "neutral"])
  userMoodHint?: "stressed" | "calm" | "urgent" | "focused" | "neutral";

  /** Explore → Chat canonical handoff (v1 JSON string). Orchestration-only. */
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  exploreHandoffJson?: string | null;

  @IsString()
  @IsNotEmpty()
  message!: string;
}

