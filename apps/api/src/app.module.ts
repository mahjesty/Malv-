import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { join } from "path";
import { AuthModule } from "./auth/auth.module";
import { ChatModule } from "./chat/chat.module";
import { BeastModule } from "./beast/beast.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { KillSwitchModule } from "./kill-switch/kill-switch.module";
import { MemoryModule } from "./memory/memory.module";
import { VaultModule } from "./vault/vault.module";
import { SandboxModule } from "./sandbox/sandbox.module";
import { FileUnderstandingModule } from "./file-understanding/file-understanding.module";
import { JobRunnerModule } from "./job-runner/job-runner.module";
import { CallsModule } from "./calls/calls.module";
import { VoiceModule } from "./voice/voice.module";
import { AdminModule } from "./admin/admin.module";
import { WorkspaceModule } from "./workspace/workspace.module";
import { ConversationsModule } from "./conversations/conversations.module";
import { SupportModule } from "./support/support.module";
import { DevicesModule } from "./devices/devices.module";
import { InferenceModule } from "./inference/inference.module";
import { SmartHomeModule } from "./smart-home/smart-home.module";
import { CollaborationModule } from "./collaboration/collaboration.module";
import { CodeChangeIntelligenceModule } from "./code-change-intelligence/code-change-intelligence.module";
import { SecurityModule } from "./security/security.module";
import { MalvStudioModule } from "./malv-studio/malv-studio.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Monorepo root .env first (stable JWT_* across `npm run dev -w @malv/api`), then apps/api/.env, then cwd.
      envFilePath: [
        join(__dirname, "..", "..", "..", ".env"),
        join(__dirname, "..", "..", ".env"),
        ".env"
      ]
    }),
    TypeOrmModule.forRoot({
      type: "mysql",
      host: process.env.DB_HOST ?? "127.0.0.1",
      port: Number(process.env.DB_PORT ?? 3306),
      username: process.env.DB_USER ?? "root",
      password: process.env.DB_PASSWORD ?? "",
      database: process.env.DB_NAME ?? "malv",
      ssl: process.env.DB_SSL === "true" ? ({} as any) : false,
      synchronize: false,
      autoLoadEntities: true,
      logging: process.env.NODE_ENV === "development",
      migrationsRun: false
    }),
    SecurityModule,
    AuthModule,
    ChatModule,
    BeastModule,
    RealtimeModule,
    KillSwitchModule,
    MemoryModule,
    VaultModule,
    CallsModule,
    VoiceModule,
    AdminModule,
    SandboxModule,
    FileUnderstandingModule,
    JobRunnerModule,
    WorkspaceModule,
    ConversationsModule,
    SupportModule,
    DevicesModule,
    InferenceModule,
    SmartHomeModule,
    CollaborationModule,
    CodeChangeIntelligenceModule,
    MalvStudioModule
  ]
})
export class AppModule {}

