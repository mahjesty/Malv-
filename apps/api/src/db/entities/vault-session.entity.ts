import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, ManyToOne, JoinColumn, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { UserEntity } from "./user.entity";

export type VaultSessionStatus = "open" | "closed";

@Entity({ name: "vault_sessions" })
export class VaultSessionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Index()
  @Column({ type: "varchar", length: 20, name: "status", default: "open" })
  status!: VaultSessionStatus;

  @Column({ type: "varchar", length: 160, name: "access_label", nullable: true })
  accessLabel?: string | null;

  @Column({ type: "datetime", name: "opened_at" })
  openedAt!: Date;

  @Column({ type: "datetime", name: "closed_at", nullable: true })
  closedAt?: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}

