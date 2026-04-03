import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { SandboxRunEntity } from "./sandbox-run.entity";
import { UserEntity } from "./user.entity";
import { SandboxCommandRecordEntity } from "./sandbox-command-record.entity";

export type SandboxTypedActionType =
  | "read_file"
  | "write_file"
  | "patch_file"
  | "list_directory"
  | "search_repo"
  | "run_tests"
  | "run_typecheck"
  | "run_lint"
  | "inspect_logs"
  | "get_git_status"
  | "get_git_diff";

export type SandboxTypedActionStatus = "queued" | "running" | "completed" | "failed" | "blocked" | "approval_required";

@Entity({ name: "sandbox_typed_actions" })
export class SandboxTypedActionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => SandboxRunEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "sandbox_run_id" })
  sandboxRun!: SandboxRunEntity;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Index()
  @Column({ type: "int", name: "step_index" })
  stepIndex!: number;

  @Index()
  @Column({ type: "varchar", length: 40, name: "action_type" })
  actionType!: SandboxTypedActionType;

  @Index()
  @Column({ type: "varchar", length: 30, default: "workspace", name: "scope_type" })
  scopeType!: "workspace" | "file" | "symbol" | "directory" | "repo" | "multi_file";

  @Column({ type: "varchar", length: 500, name: "scope_ref", nullable: true })
  scopeRef?: string | null;

  @Column({ type: "json", name: "parameters_json" })
  parametersJson!: Record<string, unknown>;

  @Column({ type: "json", name: "normalized_parameters_json", nullable: true })
  normalizedParametersJson?: Record<string, unknown> | null;

  @Index()
  @Column({ type: "varchar", length: 20, name: "status", default: "queued" })
  status!: SandboxTypedActionStatus;

  @Column({ type: "datetime", name: "started_at", nullable: true })
  startedAt?: Date | null;

  @Column({ type: "datetime", name: "finished_at", nullable: true })
  finishedAt?: Date | null;

  @Column({ type: "text", name: "output_summary", nullable: true })
  outputSummary?: string | null;

  @Column({ type: "json", name: "output_meta", nullable: true })
  outputMeta?: Record<string, unknown> | null;

  @ManyToOne(() => SandboxCommandRecordEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "primary_command_record_id" })
  primaryCommandRecord?: SandboxCommandRecordEntity | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
