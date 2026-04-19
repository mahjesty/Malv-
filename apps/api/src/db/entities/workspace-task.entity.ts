import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { UserEntity } from "./user.entity";

export type WorkspaceTaskStatus = "todo" | "in_progress" | "done" | "archived";
export type WorkspaceTaskSource = "call" | "chat" | "manual" | "studio" | "voice" | "inbox" | "collaboration" | "external" | "system";
export type WorkspaceTaskPriority = "low" | "normal" | "high" | "urgent";
export type WorkspaceTaskExecutionType =
  | "manual"
  | "automated"
  | "reminder"
  | "scheduled"
  | "approval_gate"
  /** Explicit routing hints (preferred for the execution engine). */
  | "reminder_only"
  | "call_followup"
  | "chat_followup"
  | "external_action"
  | "workflow_task"
  | "manual_checklist";

/**
 * Rich execution lifecycle for the task engine. Legacy rows may still use `idle` (treated as pending).
 * `waiting_approval` is the persisted form of “waiting_for_approval” in APIs/UI copy.
 */
export type WorkspaceTaskExecutionState =
  | "idle"
  | "pending"
  | "scheduled"
  | "due"
  | "dispatched"
  | "running"
  | "waiting_input"
  | "waiting_approval"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled";
export type WorkspaceTaskRiskLevel = "low" | "medium" | "high" | "critical";

@Entity({ name: "workspace_tasks" })
@Index("ix_workspace_tasks_user_source_fingerprint_unique", ["user", "sourceFingerprint"], { unique: true })
export class WorkspaceTaskEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Index()
  @Column({ type: "varchar", length: 36, name: "assignee_user_id", nullable: true })
  assigneeUserId?: string | null;

  @Index()
  @Column({ type: "varchar", length: 220, name: "title" })
  title!: string;

  @Column({ type: "text", name: "description", nullable: true })
  description?: string | null;

  @Index()
  @Column({ type: "varchar", length: 20, name: "status", default: "todo" })
  status!: WorkspaceTaskStatus;

  @Index()
  @Column({ type: "varchar", length: 30, name: "priority", default: "normal" })
  priority!: WorkspaceTaskPriority;

  /** Legacy source field — kept for backward compat. Maps to sourceSurface. */
  @Index()
  @Column({ type: "varchar", length: 30, name: "source", default: "manual" })
  source!: WorkspaceTaskSource;

  /** Canonical surface where this task originated (replaces source long-term). */
  @Index()
  @Column({ type: "varchar", length: 30, name: "source_surface", default: "manual" })
  sourceSurface!: WorkspaceTaskSource;

  /** Semantic type of source object (e.g. "conversation", "call_session", "studio_session"). */
  @Column({ type: "varchar", length: 60, name: "source_type", nullable: true })
  sourceType?: string | null;

  /** ID of the originating source object (conversationId, callSessionId, etc.). */
  @Column({ type: "varchar", length: 36, name: "source_reference_id", nullable: true })
  sourceReferenceId?: string | null;

  /** How this task is meant to be executed. */
  @Column({ type: "varchar", length: 30, name: "execution_type", default: "manual" })
  executionType!: WorkspaceTaskExecutionType;

  /** Current execution state (richer than status). */
  @Index()
  @Column({ type: "varchar", length: 30, name: "execution_state", default: "idle" })
  executionState!: WorkspaceTaskExecutionState;

  @Index()
  @Column({ type: "varchar", length: 36, name: "conversation_id", nullable: true })
  conversationId?: string | null;

  @Index()
  @Column({ type: "varchar", length: 36, name: "call_session_id", nullable: true })
  callSessionId?: string | null;

  @Index()
  @Column({ type: "varchar", length: 36, name: "room_id", nullable: true })
  roomId?: string | null;

  @Index()
  @Column({ type: "varchar", length: 140, name: "source_fingerprint", nullable: true })
  sourceFingerprint?: string | null;

  /** When this task is due. */
  @Index()
  @Column({ type: "datetime", name: "due_at", nullable: true })
  dueAt?: Date | null;

  /** When this task is scheduled to auto-execute. */
  @Index()
  @Column({ type: "datetime", name: "scheduled_for", nullable: true })
  scheduledFor?: Date | null;

  /** When to fire a reminder for this task. */
  @Column({ type: "datetime", name: "reminder_at", nullable: true })
  reminderAt?: Date | null;

  /** Whether this task requires explicit user approval before execution. */
  @Column({ type: "tinyint", name: "requires_approval", default: 0 })
  requiresApproval!: boolean;

  /** Risk classification for approval-gated tasks. */
  @Column({ type: "varchar", length: 20, name: "risk_level", default: "low" })
  riskLevel!: WorkspaceTaskRiskLevel;

  /** Comma-separated tags for filtering (stored as JSON array). */
  @Column({ type: "json", name: "tags", nullable: true })
  tags?: string[] | null;

  /** When this task was marked complete. */
  @Column({ type: "datetime", name: "completed_at", nullable: true })
  completedAt?: Date | null;

  /** When this task was archived. */
  @Column({ type: "datetime", name: "archived_at", nullable: true })
  archivedAt?: Date | null;

  /** Extensible context payload — MALV-populated metadata, UI hints, deep-link refs, etc. */
  @Column({ type: "json", name: "metadata", nullable: true })
  metadata?: Record<string, unknown> | null;

  /** Worker / node that holds a short-lived execution lease (compare-and-set claim). */
  @Column({ type: "varchar", length: 160, name: "execution_lease_owner", nullable: true })
  executionLeaseOwner?: string | null;

  @Column({ type: "datetime", name: "execution_lease_expires_at", nullable: true })
  executionLeaseExpiresAt?: Date | null;

  @Column({ type: "datetime", name: "execution_last_attempt_at", nullable: true })
  executionLastAttemptAt?: Date | null;

  @Column({ type: "varchar", length: 40, name: "execution_last_outcome", nullable: true })
  executionLastOutcome?: string | null;

  @Column({ type: "varchar", length: 80, name: "execution_failure_code", nullable: true })
  executionFailureCode?: string | null;

  @Column({ type: "text", name: "execution_failure_detail", nullable: true })
  executionFailureDetail?: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
