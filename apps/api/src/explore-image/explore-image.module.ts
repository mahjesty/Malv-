import { forwardRef, Module } from "@nestjs/common";
import { BeastModule } from "../beast/beast.module";
import { InferenceModule } from "../inference/inference.module";
import { FileUnderstandingModule } from "../file-understanding/file-understanding.module";
import { ExploreImageController } from "./explore-image.controller";
import { ImageGenerationService } from "./image-generation.service";
import { ImageIntentService } from "./image-intent.service";
import { AgentSystemModule } from "../agent-system/agent-system.module";

@Module({
  imports: [BeastModule, forwardRef(() => InferenceModule), FileUnderstandingModule, forwardRef(() => AgentSystemModule)],
  controllers: [ExploreImageController],
  providers: [ImageIntentService, ImageGenerationService],
  exports: [ImageIntentService, ImageGenerationService]
})
export class ExploreImageModule {}
