import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, ManyToOne, JoinColumn, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { AiJobEntity } from "./ai-job.entity";
import { UserEntity } from "./user.entity";

export type SuggestionType = "next_step" | "reminder" | "opportunity";
export type SuggestionRisk = "low" | "medium" | "high";
export type SuggestionStatus = "active" | "accepted" | "dismissed" | "expired";

@Entity({ name: "suggestion_records" })
export class SuggestionRecordEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @ManyToOne(() => AiJobEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "ai_job_id" })
  aiJob?: AiJobEntity | null;

  @Index()
  @Column({ type: "varchar", length: 40, name: "suggestion_type" })
  suggestionType!: SuggestionType;

  @Index()
  @Column({ type: "varchar", length: 10, name: "risk_level", default: "low" })
  riskLevel!: SuggestionRisk;

  @Column({ type: "varchar", length: 20, name: "status", default: "active" })
  status!: SuggestionStatus;

  @Column({ type: "text", name: "content" })
  content!: string;

  @Column({ type: "json", name: "metadata", nullable: true })
  metadata?: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}

