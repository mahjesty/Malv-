import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";
import { UserEntity } from "./user.entity";
import { SandboxRunEntity } from "./sandbox-run.entity";

/**
 * High-level state for a MALV self-upgrade request.
 * Production code is never mutated through this row — only via SelfUpgradeReviewSession + apply.
 */
export type SelfUpgradeRequestStatus =
  | "draft"
  | "pending_analysis"
  | "analyzing"
  | "analysis_complete"
  | "generating"
  | "validating"
  | "preview_ready"
  | "revision_requested"
  | "rejected"
  | "approved_apply"
  | "applied"
  | "failed";

@Entity({ name: "self_upgrade_requests" })
export class SelfUpgradeRequestEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 200, name: "title" })
  title!: string;

  @Column({ type: "text", name: "description" })
  description!: string;

  @Index()
  @Column({ type: "varchar", length: 32, name: "status", default: "draft" })
  status!: SelfUpgradeRequestStatus;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "created_by_user_id" })
  createdBy!: UserEntity;

  /** Sandbox run used for audit linkage (operator/sandbox patch proposal). */
  @ManyToOne(() => SandboxRunEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "sandbox_run_id" })
  sandboxRun?: SandboxRunEntity | null;

  /**
   * Isolated git worktree path — generation/validation only. Never the production checkout root.
   */
  @Column({ type: "varchar", length: 1024, name: "sandbox_worktree_path", nullable: true })
  sandboxWorktreePath?: string | null;

  @Column({ type: "json", name: "context_json", nullable: true })
  contextJson?: Record<string, unknown> | null;

  @Column({ type: "text", name: "failure_reason", nullable: true })
  failureReason?: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
