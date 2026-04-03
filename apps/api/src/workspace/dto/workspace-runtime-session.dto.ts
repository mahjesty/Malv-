import { IsIn, IsNotEmpty, IsString } from "class-validator";
import type { WorkspaceRuntimeSourceType } from "../../db/entities/workspace-runtime-session.entity";

export class CreateWorkspaceRuntimeSessionDto {
  @IsIn(["chat", "studio", "task"])
  sourceType!: WorkspaceRuntimeSourceType;

  @IsString()
  @IsNotEmpty()
  sourceId!: string;
}

