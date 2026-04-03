import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { RoleEntity } from "./role.entity";
import { UserEntity } from "./user.entity";

@Entity({ name: "user_roles" })
export class UserRoleEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @ManyToOne(() => RoleEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "role_id" })
  role!: RoleEntity;

  // For simplicity we treat a user as having a "primary" role; multi-role can be enabled later.
  @Index()
  @Column({ type: "boolean", default: true, name: "is_primary" })
  isPrimary!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}

