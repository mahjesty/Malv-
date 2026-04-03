import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { UserEntity } from "./user.entity";

export type WorkspaceTaskStatus = "todo" | "in_progress" | "done";
export type WorkspaceTaskSource = "call" | "chat" | "manual";

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
  @Column({ type: "varchar", length: 20, name: "source", default: "manual" })
  source!: WorkspaceTaskSource;

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

  @Column({ type: "json", name: "metadata", nullable: true })
  metadata?: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
