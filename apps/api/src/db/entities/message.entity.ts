import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn
} from "typeorm";
import { ConversationEntity } from "./conversation.entity";
import { UserEntity } from "./user.entity";
import { AiJobEntity } from "./ai-job.entity";

export type MessageRole = "user" | "assistant" | "system" | "support";

/** Persisted assistant/user message lifecycle (aligned with MALV chat UI). */
export type MessageLifecycleStatus =
  | "pending"
  | "sent"
  | "thinking"
  | "streaming"
  | "done"
  | "error"
  | "interrupted"
  | "cancelled";

@Entity({ name: "messages" })
export class MessageEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @ManyToOne(() => ConversationEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "conversation_id" })
  conversation!: ConversationEntity;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Index()
  @Column({ type: "varchar", length: 20, name: "role" })
  role!: MessageRole;

  @Column({ type: "text", name: "content" })
  content!: string;

  @Column({ type: "json", name: "metadata", nullable: true })
  metadata?: Record<string, unknown> | null;

  @Index()
  @Column({ type: "varchar", length: 24, name: "status", default: "done" })
  status!: MessageLifecycleStatus;

  @Index()
  @ManyToOne(() => AiJobEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "run_id" })
  run?: AiJobEntity | null;

  @Column({ type: "varchar", length: 40, name: "source", nullable: true })
  source?: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}

