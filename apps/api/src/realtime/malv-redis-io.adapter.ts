import { Logger } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import type { INestApplicationContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import type { ServerOptions } from "socket.io";

export class MalvRedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(MalvRedisIoAdapter.name);
  private readonly cfg: ConfigService;
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;

  constructor(app: INestApplicationContext) {
    super(app);
    this.cfg = app.get(ConfigService);
  }

  async connectToRedis(): Promise<void> {
    const redisUrl = (this.cfg.get<string>("REDIS_SOCKET_IO_ADAPTER_URL") ?? this.cfg.get<string>("REDIS_URL") ?? "").trim();
    if (!redisUrl) return;
    this.pubClient = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, enableReadyCheck: true });
    this.subClient = this.pubClient.duplicate();
    await this.pubClient.connect();
    await this.subClient.connect();
    this.logger.log("Socket.IO redis adapter enabled.");
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    if (this.pubClient && this.subClient) {
      server.adapter(createAdapter(this.pubClient, this.subClient));
    }
    return server;
  }
}
