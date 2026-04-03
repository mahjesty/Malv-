import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";
import { UserEntity } from "./user.entity";
import { WorkspaceEntity } from "./workspace.entity";

export type SandboxRunType = "action_prep" | "self_evolve" | "tool_exec" | "file_understand_extract";

export type SandboxRunStatus =
  | "staged"
  | "validation_pending"
  | "validation_failed"
  | "approval_pending"
  | "paused_approval_required"
  | "approved"
  | "executing"
  | "completed"
  | "failed"
  | "blocked"
  | "cancelled";

@Entity({ name: "sandbox_runs" })
export class SandboxRunEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Index()
  @ManyToOne(() => WorkspaceEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "workspace_id" })
  workspace?: WorkspaceEntity | null;

  @Index()
  @Column({ type: "varchar", length: 60, name: "run_type" })
  runType!: SandboxRunType;

  @Index()
  @Column({ type: "varchar", length: 20, name: "status", default: "staged" })
  status!: SandboxRunStatus;

  @Index()
  @Column({ type: "int", name: "run_priority", default: 50 })
  runPriority!: number;

  @Column({ type: "varchar", length: 60, name: "policy_version", nullable: true })
  policyVersion?: string | null;

  @Column({ type: "json", name: "input_payload", nullable: true })
  inputPayload?: Record<string, unknown> | null;

  @Column({ type: "json", name: "output_payload", nullable: true })
  outputPayload?: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @Column({ type: "datetime", name: "finished_at", nullable: true })
  finishedAt?: Date | null;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}

