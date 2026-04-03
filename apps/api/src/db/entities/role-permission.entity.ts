import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { RoleEntity } from "./role.entity";
import { PermissionEntity } from "./permission.entity";

@Entity({ name: "role_permissions" })
export class RolePermissionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @ManyToOne(() => RoleEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "role_id" })
  role!: RoleEntity;

  @Index()
  @ManyToOne(() => PermissionEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "permission_id" })
  permission!: PermissionEntity;

  @Column({ type: "boolean", default: true })
  granted!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}
