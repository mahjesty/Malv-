import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { AiJobEntity } from "./ai-job.entity";
import { UserEntity } from "./user.entity";

export type BeastLogType = "inference" | "friction_detection" | "unfinished_work" | "proactive_suggestions" | "support_summarize";

@Entity({ name: "beast_activity_logs" })
export class BeastActivityLogEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @ManyToOne(() => AiJobEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "ai_job_id" })
  aiJob?: AiJobEntity | null;

  @Index()
  @Column({ type: "varchar", length: 50, name: "event_type" })
  eventType!: BeastLogType;

  @Column({ type: "json", name: "payload", nullable: true })
  payload?: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}

