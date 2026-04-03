import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { UserEntity } from "./user.entity";
import { WorkspaceRoleEntity } from "./workspace-role.entity";

@Entity({ name: "workspaces" })
export class WorkspaceEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 160, name: "name" })
  name!: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 160, name: "slug" })
  slug!: string;

  @ManyToOne(() => UserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "owner_user_id" })
  owner!: UserEntity;

  @OneToMany(() => WorkspaceRoleEntity, (r) => r.workspace)
  roles?: WorkspaceRoleEntity[];

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
