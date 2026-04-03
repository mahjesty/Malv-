import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { UserEntity } from "./user.entity";
import { WorkspaceEntity } from "./workspace.entity";

@Entity({ name: "malv_studio_sessions" })
export class MalvStudioSessionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Index()
  @ManyToOne(() => WorkspaceEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "workspace_id" })
  workspace?: WorkspaceEntity | null;

  @Column({ type: "varchar", length: 160, default: "MALV Studio Session" })
  title!: string;

  @Column({ type: "varchar", length: 40, default: "active" })
  status!: "active" | "building" | "ready" | "error" | "applied" | "reverted";

  @Column({ type: "json", name: "selected_target", nullable: true })
  selectedTarget?: Record<string, unknown> | null;

  @Column({ type: "json", name: "preview_context", nullable: true })
  previewContext?: Record<string, unknown> | null;

  @Column({ type: "json", name: "pending_change_summary", nullable: true })
  pendingChangeSummary?: Record<string, unknown> | null;

  @Column({ type: "json", nullable: true })
  versions?: Array<Record<string, unknown>> | null;

  @Column({ type: "varchar", length: 36, name: "last_sandbox_run_id", nullable: true })
  lastSandboxRunId?: string | null;

  @Column({ type: "varchar", length: 36, name: "last_patch_proposal_id", nullable: true })
  lastPatchProposalId?: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
