import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from "class-validator";

/** Optional catalog fields when publishing an approved intake to a build unit. */
export class PublishSourceIntakeDto {
  @IsOptional()
  @IsString()
  @MaxLength(220)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  type?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  tags?: string[];
}
