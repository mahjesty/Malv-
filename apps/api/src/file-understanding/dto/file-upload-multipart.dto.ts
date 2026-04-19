import { IsIn, IsOptional, IsUUID, ValidateIf } from "class-validator";

export const FILE_UPLOAD_KIND_VALUES = ["pdf", "image", "audio", "video", "doc", "text"] as const;

/** Multipart fields for POST /v1/files/upload (file binary is separate multer field `file`). */
export class FileUploadMultipartDto {
  @IsIn(FILE_UPLOAD_KIND_VALUES as unknown as string[])
  fileKind!: (typeof FILE_UPLOAD_KIND_VALUES)[number];

  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== "")
  @IsUUID()
  workspaceId?: string;

  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== "")
  @IsUUID()
  roomId?: string;
}
