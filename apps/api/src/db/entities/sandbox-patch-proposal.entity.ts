import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { SandboxRunEntity } from "./sandbox-run.entity";
import { UserEntity } from "./user.entity";

export type SandboxPatchStatus = "pending" | "approved" | "applied" | "rejected" | "apply_failed";

@Entity({ name: "sandbox_patch_proposals" })
export class SandboxPatchProposalEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => SandboxRunEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "sandbox_run_id" })
  sandboxRun!: SandboxRunEntity;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Index()
  @Column({ type: "varchar", length: 20, name: "status", default: "pending" })
  status!: SandboxPatchStatus;

  @Column({ type: "longtext", name: "diff_text" })
  diffText!: string;

  @Column({ type: "json", name: "summary", nullable: true })
  summary?: Record<string, unknown> | null;

  @Column({ type: "varchar", length: 120, name: "reviewed_by", nullable: true })
  reviewedBy?: string | null;

  @Column({ type: "datetime", name: "reviewed_at", nullable: true })
  reviewedAt?: Date | null;

  @Column({ type: "text", name: "review_note", nullable: true })
  reviewNote?: string | null;

  @Column({ type: "datetime", name: "applied_at", nullable: true })
  appliedAt?: Date | null;

  @Column({ type: "text", name: "apply_error", nullable: true })
  applyError?: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}

