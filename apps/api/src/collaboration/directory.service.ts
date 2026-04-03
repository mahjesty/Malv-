import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Like, Not, Repository } from "typeorm";
import { UserEntity } from "../db/entities/user.entity";
import { KillSwitchService } from "../kill-switch/kill-switch.service";

@Injectable()
export class DirectoryService {
  constructor(
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    private readonly killSwitch: KillSwitchService
  ) {}

  /**
   * Search users by display name for invite flows. Does not expose email addresses.
   */
  async searchUsers(args: { actorUserId: string; query: string; limit: number }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "directory_search" });

    const raw = args.query.trim();
    if (raw.length < 2) {
      throw new BadRequestException("Query must be at least 2 characters.");
    }
    const limit = Math.min(30, Math.max(1, args.limit));
    const safe = raw.replace(/[%_\\]/g, "").slice(0, 80);
    if (safe.length < 2) {
      throw new BadRequestException("Query must contain at least 2 non-wildcard characters.");
    }

    const rows = await this.users.find({
      where: {
        id: Not(args.actorUserId),
        isActive: true,
        displayName: Like(`%${safe}%`)
      },
      order: { displayName: "ASC" },
      take: limit,
      select: ["id", "displayName"]
    });

    return {
      users: rows.map((u) => ({ userId: u.id, displayName: u.displayName }))
    };
  }
}
