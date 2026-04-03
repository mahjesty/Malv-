import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { WorkspaceAccessService, type GlobalRole } from "./workspace-access.service";
import { WorkspaceProvisioningService } from "./workspace-provisioning.service";

class CreateWorkspaceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  slug?: string | null;
}

class AddMemberDto {
  @IsUUID()
  targetUserId!: string;

  @IsIn(["owner", "member", "reviewer"])
  roleKey!: "owner" | "member" | "reviewer";
}

@Controller("v1/workspaces")
export class WorkspaceController {
  constructor(
    private readonly provisioning: WorkspaceProvisioningService,
    private readonly access: WorkspaceAccessService
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Req() req: Request, @Body() body: CreateWorkspaceDto) {
    const auth = (req as any).user as { userId: string; role?: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const ws = await this.provisioning.createWorkspaceForUser({
      ownerUserId: auth.userId,
      name: body.name,
      slug: body.slug ?? null
    });
    return { ok: true, workspace: { id: ws.id, name: ws.name, slug: ws.slug } };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@Req() req: Request) {
    const auth = (req as any).user as { userId: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const rows = await this.provisioning.listWorkspacesForUser(auth.userId);
    return {
      ok: true,
      workspaces: rows.map((w) => ({ id: w.id, name: w.name, slug: w.slug, ownerUserId: (w.owner as any)?.id ?? null }))
    };
  }

  @Post(":workspaceId/members")
  @UseGuards(JwtAuthGuard)
  async addMember(@Req() req: Request, @Param("workspaceId") workspaceId: string, @Body() body: AddMemberDto) {
    const auth = (req as any).user as { userId: string; role?: string } | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    const globalRole = (auth.role === "admin" ? "admin" : "user") as GlobalRole;
    await this.access.assertWorkspacePermissionOrThrow({
      userId: auth.userId,
      globalRole,
      workspaceId,
      requiredPermissions: ["workspace.admin.manage"],
      route: "/v1/workspaces/:workspaceId/members",
      method: "POST"
    });
    const row = await this.provisioning.addUserToWorkspaceRole({
      actorUserId: auth.userId,
      workspaceId,
      targetUserId: body.targetUserId,
      roleKey: body.roleKey
    });
    return { ok: true, membershipId: row.id };
  }
}
