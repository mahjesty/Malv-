import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { UserEntity } from "./user.entity";
import { SandboxRunEntity } from "./sandbox-run.entity";
import { AiJobEntity } from "./ai-job.entity";
import { VoiceOperatorEventEntity } from "./voice-operator-event.entity";
import { WorkspaceEntity } from "./workspace.entity";

export type ReviewStatus = "running" | "completed" | "failed";
export type ReviewTargetType = "file" | "symbol" | "page" | "issue" | "task" | "workspace" | "repository";

@Entity({ name: "review_sessions" })
export class ReviewSessionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @ManyToOne(() => VoiceOperatorEventEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "voice_operator_event_id" })
  voiceOperatorEvent?: VoiceOperatorEventEntity | null;

  @ManyToOne(() => AiJobEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "ai_job_id" })
  aiJob?: AiJobEntity | null;

  @ManyToOne(() => SandboxRunEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "sandbox_run_id" })
  sandboxRun?: SandboxRunEntity | null;

  @Index()
  @ManyToOne(() => WorkspaceEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "workspace_id" })
  workspace?: WorkspaceEntity | null;

  @Index()
  @Column({ type: "varchar", length: 20, name: "status", default: "running" })
  status!: ReviewStatus;

  @Index()
  @Column({ type: "varchar", length: 20, name: "target_type" })
  targetType!: ReviewTargetType;

  @Column({ type: "varchar", length: 500, name: "target_ref", nullable: true })
  targetRef?: string | null;

  @Column({ type: "json", name: "target_metadata", nullable: true })
  targetMetadata?: Record<string, unknown> | null;

  @Column({ type: "json", name: "plan_summary", nullable: true })
  planSummary?: Record<string, unknown> | null;

  @Column({ type: "text", name: "result_summary", nullable: true })
  resultSummary?: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
