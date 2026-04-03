import { CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from "typeorm";
import { UserEntity } from "./user.entity";
import { WorkspaceEntity } from "./workspace.entity";
import { WorkspaceRoleEntity } from "./workspace-role.entity";

@Entity({ name: "workspace_user_roles" })
@Unique(["user", "workspace"])
export class WorkspaceUserRoleEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Index()
  @ManyToOne(() => WorkspaceEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace!: WorkspaceEntity;

  @ManyToOne(() => WorkspaceRoleEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_role_id" })
  workspaceRole!: WorkspaceRoleEntity;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
