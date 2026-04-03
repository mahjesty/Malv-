import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { UserEntity } from "./user.entity";
import { CallSessionEntity } from "./call-session.entity";
import { AiJobEntity } from "./ai-job.entity";
import { SandboxRunEntity } from "./sandbox-run.entity";
import { ReviewSessionEntity } from "./review-session.entity";
import { OperatorTargetEntity } from "./operator-target.entity";

export type VoiceIntentType = "ask" | "explain" | "inspect" | "summarize" | "execute_task" | "operator_workflow" | "vault_trigger";

@Entity({ name: "voice_operator_events" })
export class VoiceOperatorEventEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @ManyToOne(() => CallSessionEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "call_session_id" })
  callSession?: CallSessionEntity | null;

  @ManyToOne(() => AiJobEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "ai_job_id" })
  aiJob?: AiJobEntity | null;

  @ManyToOne(() => SandboxRunEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "sandbox_run_id" })
  sandboxRun?: SandboxRunEntity | null;

  @ManyToOne(() => ReviewSessionEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "review_session_id" })
  reviewSession?: ReviewSessionEntity | null;

  @ManyToOne(() => OperatorTargetEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "operator_target_id" })
  operatorTarget?: OperatorTargetEntity | null;

  @Index()
  @Column({ type: "varchar", length: 30, name: "intent_type" })
  intentType!: VoiceIntentType;

  @Column({ type: "text", name: "utterance_text" })
  utteranceText!: string;

  @Column({ type: "json", name: "resolved_context", nullable: true })
  resolvedContext?: Record<string, unknown> | null;

  @Column({ type: "json", name: "execution_plan", nullable: true })
  executionPlan?: Record<string, unknown> | null;

  @Column({ type: "json", name: "result_meta", nullable: true })
  resultMeta?: Record<string, unknown> | null;

  @Column({ type: "decimal", precision: 5, scale: 4, name: "resolution_confidence", nullable: true })
  resolutionConfidence?: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}

