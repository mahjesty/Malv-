import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { UserEntity } from "./user.entity";
import { ConversationEntity } from "./conversation.entity";

export type AiJobType =
  | "beast_chat_infer"
  | "file_understand"
  | "support_summarize"
  | "beast_proactive"
  | "multimodal_deep_extract";
export type AiJobStatus = "queued" | "running" | "waiting_for_approval" | "completed" | "failed" | "cancelled";

@Entity({ name: "ai_jobs" })
export class AiJobEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @ManyToOne(() => ConversationEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "conversation_id" })
  conversation?: ConversationEntity | null;

  @Index()
  @Column({ type: "varchar", length: 60, name: "job_type" })
  jobType!: AiJobType;

  @Index()
  @Column({ type: "varchar", length: 20, name: "requested_mode" })
  requestedMode!: string;

  @Index()
  @Column({ type: "varchar", length: 20, name: "classified_mode" })
  classifiedMode!: string;

  @Index()
  @Column({ type: "varchar", length: 20, name: "status", default: "queued" })
  status!: AiJobStatus;

  @Column({ type: "int", name: "progress", default: 0 })
  progress!: number;

  @Column({ type: "int", name: "attempt_count", default: 0 })
  attemptCount!: number;

  @Column({ type: "int", name: "max_attempts", default: 3 })
  maxAttempts!: number;

  @Index()
  @Column({ type: "datetime", name: "next_retry_after", nullable: true })
  nextRetryAfter?: Date | null;

  @Index()
  @Column({ type: "varchar", length: 120, name: "shard_key", default: "default" })
  shardKey!: string;

  @Index()
  @Column({ type: "int", name: "queue_priority", default: 50 })
  queuePriority!: number;

  @Column({ type: "json", name: "payload", nullable: true })
  payload?: Record<string, unknown> | null;

  @Column({ type: "longtext", name: "result_reply", nullable: true })
  resultReply?: string | null;

  @Column({ type: "json", name: "result_meta", nullable: true })
  resultMeta?: Record<string, unknown> | null;

  @Column({ type: "varchar", length: 1200, name: "error_message", nullable: true })
  errorMessage?: string | null;

  @Index()
  @Column({ type: "varchar", length: 20, name: "beast_level", nullable: true })
  beastLevel?: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @Column({ type: "datetime", name: "finished_at", nullable: true })
  finishedAt?: Date | null;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}

