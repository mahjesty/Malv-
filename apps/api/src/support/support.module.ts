import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SupportTicketEntity } from "../db/entities/support-ticket.entity";
import { SupportMessageEntity } from "../db/entities/support-message.entity";
import { SupportCategoryEntity } from "../db/entities/support-category.entity";
import { KillSwitchModule } from "../kill-switch/kill-switch.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { SupportService } from "./support.service";
import { SupportController } from "./support.controller";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CommonModule } from "../common/common.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([SupportTicketEntity, SupportMessageEntity, SupportCategoryEntity]),
    KillSwitchModule,
    forwardRef(() => CommonModule),
    forwardRef(() => RealtimeModule)
  ],
  controllers: [SupportController],
  providers: [SupportService, JwtAuthGuard],
  exports: [SupportService]
})
export class SupportModule {}
