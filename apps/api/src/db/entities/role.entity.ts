import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

export type RoleKey = "admin" | "user" | "supervisor";

@Entity({ name: "roles" })
export class RoleEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 50, name: "role_key" })
  roleKey!: RoleKey;

  @Column({ type: "varchar", length: 120, name: "role_name" })
  roleName!: string;

  @Column({ type: "boolean", default: true, name: "is_active" })
  isActive!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}

