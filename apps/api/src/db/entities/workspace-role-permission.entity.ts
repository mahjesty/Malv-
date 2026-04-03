import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from "typeorm";
import { WorkspaceRoleEntity } from "./workspace-role.entity";
import { PermissionEntity } from "./permission.entity";

@Entity({ name: "workspace_role_permissions" })
@Unique(["workspaceRole", "permission"])
export class WorkspaceRolePermissionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => WorkspaceRoleEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_role_id" })
  workspaceRole!: WorkspaceRoleEntity;

  @Index()
  @ManyToOne(() => PermissionEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "permission_id" })
  permission!: PermissionEntity;

  @Column({ type: "boolean", default: true, name: "granted" })
  granted!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
