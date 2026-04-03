import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { UserEntity } from "./user.entity";

export type WorkspaceRuntimeSourceType = "chat" | "studio" | "task";
export type WorkspaceRuntimeSessionStatus = "idle" | "running" | "waiting_approval" | "completed" | "failed";

@Entity({ name: "workspace_runtime_sessions" })
@Index("ix_workspace_runtime_sessions_source", ["sourceType", "sourceId"])
export class WorkspaceRuntimeSessionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Index()
  @Column({ type: "varchar", length: 20, name: "source_type" })
  sourceType!: WorkspaceRuntimeSourceType;

  @Column({ type: "varchar", length: 64, name: "source_id" })
  sourceId!: string;

  @Index()
  @Column({ type: "varchar", length: 24, name: "status", default: "idle" })
  status!: WorkspaceRuntimeSessionStatus;

  @Column({ type: "varchar", length: 36, name: "active_run_id", nullable: true })
  activeRunId?: string | null;

  @Column({ type: "datetime", name: "last_event_at", nullable: true })
  lastEventAt?: Date | null;

  @Column({ type: "json", name: "metadata", nullable: true })
  metadata?: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}

