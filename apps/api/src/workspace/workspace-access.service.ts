import { ForbiddenException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AuditEventEntity } from "../db/entities/audit-event.entity";
import { WorkspaceUserRoleEntity } from "../db/entities/workspace-user-role.entity";
import { WorkspaceEntity } from "../db/entities/workspace.entity";

export type GlobalRole = "admin" | "user";

@Injectable()
export class WorkspaceAccessService {
  constructor(
    @InjectRepository(WorkspaceUserRoleEntity) private readonly userRoles: Repository<WorkspaceUserRoleEntity>,
    @InjectRepository(WorkspaceEntity) private readonly workspaces: Repository<WorkspaceEntity>,
    @InjectRepository(AuditEventEntity) private readonly audits: Repository<AuditEventEntity>
  ) {}

  async getEffectiveWorkspacePermissionKeys(userId: string, workspaceId: string): Promise<Set<string>> {
    const rows = await this.userRoles.find({
      where: { user: { id: userId }, workspace: { id: workspaceId } },
      relations: ["workspaceRole", "workspaceRole.permissions", "workspaceRole.permissions.permission"]
    });
    const keys = new Set<string>();
    for (const row of rows) {
      const rps = row.workspaceRole?.permissions ?? [];
      for (const rp of rps) {
        const pk = rp.permission?.permissionKey;
        if (pk && rp.granted) keys.add(pk);
      }
    }
    return keys;
  }

  async assertWorkspacePermissionOrThrow(args: {
    userId: string;
    globalRole: GlobalRole;
    workspaceId: string | null | undefined;
    requiredPermissions: string[];
    route?: string;
    method?: string;
  }): Promise<void> {
    if (args.globalRole === "admin") return;
    if (!args.workspaceId) return;
    const granted = await this.getEffectiveWorkspacePermissionKeys(args.userId, args.workspaceId);
    const ok = args.requiredPermissions.every((p) => granted.has(p));
    if (!ok) {
      await this.audits.save(
        this.audits.create({
          actorUser: { id: args.userId } as any,
          eventType: "workspace_permission_denied",
          level: "warn",
          message: `Workspace permission denied: requires [${args.requiredPermissions.join(", ")}]`,
          metadata: {
            workspaceId: args.workspaceId,
            requiredPermissions: args.requiredPermissions,
            grantedPermissions: Array.from(granted),
            method: args.method ?? "UNKNOWN",
            route: args.route ?? "unknown"
          }
        })
      );
      throw new ForbiddenException("Workspace permission denied.");
    }
  }

  async assertPersonalOrWorkspaceOwner(args: {
    userId: string;
    globalRole: GlobalRole;
    resourceUserId: string;
    workspaceId: string | null | undefined;
    requiredWorkspacePermissions: string[];
    route?: string;
    method?: string;
  }): Promise<void> {
    if (args.globalRole === "admin") return;
    if (!args.workspaceId) {
      if (args.resourceUserId !== args.userId) {
        await this.audits.save(
          this.audits.create({
            actorUser: { id: args.userId } as any,
            eventType: "workspace_permission_denied",
            level: "warn",
            message: "Personal resource access denied (not owner)",
            metadata: { resourceUserId: args.resourceUserId, method: args.method, route: args.route }
          })
        );
        throw new ForbiddenException("Access denied.");
      }
      return;
    }
    await this.assertWorkspacePermissionOrThrow({
      userId: args.userId,
      globalRole: args.globalRole,
      workspaceId: args.workspaceId,
      requiredPermissions: args.requiredWorkspacePermissions,
      route: args.route,
      method: args.method
    });
  }

  async isWorkspaceMember(userId: string, workspaceId: string): Promise<boolean> {
    const n = await this.userRoles.count({ where: { user: { id: userId }, workspace: { id: workspaceId } } });
    return n > 0;
  }

  async getWorkspaceOrThrow(workspaceId: string): Promise<WorkspaceEntity> {
    const ws = await this.workspaces.findOne({ where: { id: workspaceId } });
    if (!ws) throw new ForbiddenException("Workspace not found.");
    return ws;
  }
}
