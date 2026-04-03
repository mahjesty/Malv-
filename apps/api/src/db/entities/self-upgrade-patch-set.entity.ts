import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from "typeorm";
import { SelfUpgradeRequestEntity } from "./self-upgrade-request.entity";
import { SandboxRunEntity } from "./sandbox-run.entity";
import { SandboxPatchProposalEntity } from "./sandbox-patch-proposal.entity";

/**
 * Staged patch artifact produced in the sandbox worktree.
 * Full diff is stored here and mirrored on sandbox_patch_proposals for apply/reuse.
 */
@Entity({ name: "self_upgrade_patch_sets" })
export class SelfUpgradePatchSetEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @ManyToOne(() => SelfUpgradeRequestEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "request_id" })
  request!: SelfUpgradeRequestEntity;

  @ManyToOne(() => SandboxRunEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "sandbox_run_id" })
  sandboxRun?: SandboxRunEntity | null;

  @ManyToOne(() => SandboxPatchProposalEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "sandbox_patch_proposal_id" })
  sandboxPatchProposal?: SandboxPatchProposalEntity | null;

  @Column({ type: "longtext", name: "diff_text" })
  diffText!: string;

  @Column({ type: "json", name: "changed_files" })
  changedFiles!: Record<string, unknown>;

  @Column({ type: "json", name: "validation_summary" })
  validationSummary!: Record<string, unknown>;

  @Column({ type: "boolean", name: "validation_passed", default: false })
  validationPassed!: boolean;

  @Column({ type: "json", name: "risk_notes", nullable: true })
  riskNotes?: Record<string, unknown> | null;

  @Column({ type: "text", name: "rollback_plan", nullable: true })
  rollbackPlan?: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
