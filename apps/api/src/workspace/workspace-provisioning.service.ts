import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PermissionEntity } from "../db/entities/permission.entity";
import { UserEntity } from "../db/entities/user.entity";
import { WorkspaceEntity } from "../db/entities/workspace.entity";
import { WorkspaceRoleEntity } from "../db/entities/workspace-role.entity";
import { WorkspaceRolePermissionEntity } from "../db/entities/workspace-role-permission.entity";
import { WorkspaceUserRoleEntity } from "../db/entities/workspace-user-role.entity";

const OWNER_ROLE = "owner";
const MEMBER_ROLE = "member";
const REVIEWER_ROLE = "reviewer";

@Injectable()
export class WorkspaceProvisioningService {
  constructor(
    @InjectRepository(WorkspaceEntity) private readonly workspaces: Repository<WorkspaceEntity>,
    @InjectRepository(WorkspaceRoleEntity) private readonly roles: Repository<WorkspaceRoleEntity>,
    @InjectRepository(WorkspaceUserRoleEntity) private readonly userRoles: Repository<WorkspaceUserRoleEntity>,
    @InjectRepository(WorkspaceRolePermissionEntity) private readonly rolePerms: Repository<WorkspaceRolePermissionEntity>,
    @InjectRepository(PermissionEntity) private readonly permissions: Repository<PermissionEntity>
  ) {}

  private slugify(input: string): string {
    const s = input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120);
    return s || "workspace";
  }

  async createWorkspaceForUser(args: { ownerUserId: string; name: string; slug?: string | null }): Promise<WorkspaceEntity> {
    const baseSlug = this.slugify(args.slug ?? args.name);
    let slug = baseSlug;
    for (let i = 0; i < 20; i++) {
      const exists = await this.workspaces.findOne({ where: { slug } });
      if (!exists) break;
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`;
    }

    const ws = this.workspaces.create({
      name: args.name.slice(0, 160),
      slug,
      owner: { id: args.ownerUserId } as UserEntity
    });
    await this.workspaces.save(ws);

    const ownerRole = await this.roles.save(
      this.roles.create({
        workspace: ws,
        roleKey: OWNER_ROLE,
        displayName: "Owner"
      })
    );
    const memberRole = await this.roles.save(
      this.roles.create({
        workspace: ws,
        roleKey: MEMBER_ROLE,
        displayName: "Member"
      })
    );
    const reviewerRole = await this.roles.save(
      this.roles.create({
        workspace: ws,
        roleKey: REVIEWER_ROLE,
        displayName: "Reviewer"
      })
    );

    const allWorkspacePerms = await this.permissions
      .createQueryBuilder("p")
      .where("p.permission_key LIKE :pfx", { pfx: "workspace.%" })
      .getMany();
    const keyToId = new Map(allWorkspacePerms.map((p) => [p.permissionKey, p]));

    const grant = async (role: WorkspaceRoleEntity, keys: string[]) => {
      for (const k of keys) {
        const perm = keyToId.get(k);
        if (!perm) continue;
        await this.rolePerms.save(
          this.rolePerms.create({
            workspaceRole: role,
            permission: perm,
            granted: true
          })
        );
      }
    };

    await grant(
      ownerRole,
      allWorkspacePerms.map((p) => p.permissionKey).filter((k): k is string => Boolean(k))
    );

    await grant(memberRole, [
      "workspace.member.read",
      "workspace.files.read",
      "workspace.sandbox.execute",
      "workspace.operator.dispatch",
      "workspace.review.create"
    ]);

    await grant(reviewerRole, ["workspace.member.read", "workspace.files.read", "workspace.review.create"]);

    await this.userRoles.save(
      this.userRoles.create({
        user: { id: args.ownerUserId } as any,
        workspace: ws,
        workspaceRole: ownerRole
      })
    );

    return ws;
  }

  async listWorkspacesForUser(userId: string): Promise<WorkspaceEntity[]> {
    const links = await this.userRoles.find({
      where: { user: { id: userId } },
      relations: ["workspace", "workspace.owner"]
    });
    const map = new Map<string, WorkspaceEntity>();
    for (const l of links) {
      const w = l.workspace as WorkspaceEntity;
      if (w?.id) map.set(w.id, w);
    }
    return Array.from(map.values());
  }

  async addUserToWorkspaceRole(args: {
    actorUserId: string;
    workspaceId: string;
    targetUserId: string;
    roleKey: typeof OWNER_ROLE | typeof MEMBER_ROLE | typeof REVIEWER_ROLE;
  }): Promise<WorkspaceUserRoleEntity> {
    const role = await this.roles.findOne({
      where: { workspace: { id: args.workspaceId }, roleKey: args.roleKey }
    });
    if (!role) throw new BadRequestException("Workspace role not found.");
    const existing = await this.userRoles.findOne({
      where: { user: { id: args.targetUserId }, workspace: { id: args.workspaceId } }
    });
    if (existing) {
      existing.workspaceRole = role;
      return this.userRoles.save(existing);
    }
    return this.userRoles.save(
      this.userRoles.create({
        user: { id: args.targetUserId } as any,
        workspace: { id: args.workspaceId } as any,
        workspaceRole: role
      })
    );
  }
}
