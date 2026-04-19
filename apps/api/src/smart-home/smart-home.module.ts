import { forwardRef, Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { SmartHomeService } from "./smart-home.service";
import { SmartHomeController } from "./smart-home.controller";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

@Module({
  imports: [forwardRef(() => CommonModule)],
  controllers: [SmartHomeController],
  providers: [SmartHomeService, JwtAuthGuard],
  exports: [SmartHomeService]
})
export class SmartHomeModule {}
