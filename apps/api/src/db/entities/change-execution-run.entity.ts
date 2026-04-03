import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { ChangeRequestEntity } from "./change-request.entity";

export type ChangeExecutionRunStatus = "running" | "completed" | "blocked" | "failed";

@Entity({ name: "change_execution_runs" })
export class ChangeExecutionRunEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @ManyToOne(() => ChangeRequestEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "change_request_id" })
  changeRequest!: ChangeRequestEntity;

  @Column({ type: "char", length: 36, name: "sandbox_run_id", nullable: true })
  sandboxRunId?: string | null;

  @Column({ type: "text", name: "execution_summary" })
  executionSummary!: string;

  @Column({ type: "json", name: "files_changed" })
  filesChanged!: string[];

  @Column({ type: "text", name: "patch_summary" })
  patchSummary!: string;

  @Index()
  @Column({ type: "varchar", length: 20, name: "status", default: "running" })
  status!: ChangeExecutionRunStatus;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
