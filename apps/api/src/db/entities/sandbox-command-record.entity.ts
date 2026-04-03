import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { SandboxRunEntity } from "./sandbox-run.entity";
import { UserEntity } from "./user.entity";

export type SandboxCommandClass = "read" | "analyze" | "execute" | "modify" | "system";
export type SandboxCommandStatus = "queued" | "running" | "completed" | "failed" | "blocked";

@Entity({ name: "sandbox_command_records" })
export class SandboxCommandRecordEntity {
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

  @Column({ type: "varchar", length: 40, name: "command_class" })
  commandClass!: SandboxCommandClass;

  @Column({ type: "text", name: "command_text" })
  commandText!: string;

  @Column({ type: "varchar", length: 20, name: "status", default: "queued" })
  status!: SandboxCommandStatus;

  @Column({ type: "int", name: "exit_code", nullable: true })
  exitCode?: number | null;

  @Column({ type: "int", name: "duration_ms", nullable: true })
  durationMs?: number | null;

  @Column({ type: "longtext", name: "stdout_text", nullable: true })
  stdoutText?: string | null;

  @Column({ type: "longtext", name: "stderr_text", nullable: true })
  stderrText?: string | null;

  @Column({ type: "json", name: "parsed_result", nullable: true })
  parsedResult?: Record<string, unknown> | null;

  @Column({ type: "json", name: "metadata", nullable: true })
  metadata?: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}

