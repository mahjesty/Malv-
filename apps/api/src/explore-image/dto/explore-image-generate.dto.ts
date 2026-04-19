import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import {
  IMAGE_PROMPT_EXPANSION_MODES,
  type ImagePromptExpansionMode
} from "../image-prompt-expansion.constants";

export class ExploreImageGenerateDto {
  /**
   * Full generation / transform brief. For upload-based transform modes the client must send the
   * composed recipe here (not only the mode title); `modeId` is auxiliary metadata.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  prompt!: string;

  /**
   * Optional data URL for image-to-image / transform flows.
   * Prefer `sourceImageFileId` for large sources (staged via POST /v1/files/upload).
   */
  @IsOptional()
  @IsString()
  @MaxLength(2_500_000)
  sourceImageDataUrl?: string;

  /** Staged file id (same user) — avoids huge JSON bodies. */
  @IsOptional()
  @IsUUID()
  sourceImageFileId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  modeId?: string;

  /** Alters tone of automatic prompt expansion (text-to-image and short transform captions). */
  @IsOptional()
  @IsString()
  @IsIn([...IMAGE_PROMPT_EXPANSION_MODES])
  promptExpansionMode?: ImagePromptExpansionMode;
}
