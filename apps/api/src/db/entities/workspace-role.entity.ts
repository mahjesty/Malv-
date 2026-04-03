import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique } from "typeorm";
import { WorkspaceEntity } from "./workspace.entity";
import { WorkspaceRolePermissionEntity } from "./workspace-role-permission.entity";

@Entity({ name: "workspace_roles" })
@Unique(["workspace", "roleKey"])
export class WorkspaceRoleEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @ManyToOne(() => WorkspaceEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace!: WorkspaceEntity;

  @Column({ type: "varchar", length: 40, name: "role_key" })
  roleKey!: string;

  @Column({ type: "varchar", length: 120, name: "display_name" })
  displayName!: string;

  @OneToMany(() => WorkspaceRolePermissionEntity, (p) => p.workspaceRole)
  permissions?: WorkspaceRolePermissionEntity[];

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
