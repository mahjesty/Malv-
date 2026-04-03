import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "permissions" })
export class PermissionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 120, name: "permission_key" })
  permissionKey!: string;

  @Column({ type: "varchar", length: 200, name: "permission_name" })
  permissionName!: string;

  @Column({ type: "text", nullable: true })
  description?: string | null;

  @Column({ type: "boolean", default: true, name: "is_active" })
  isActive!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}
