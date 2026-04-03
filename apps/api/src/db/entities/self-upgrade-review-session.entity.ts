import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";
import { SelfUpgradeRequestEntity } from "./self-upgrade-request.entity";
import { SelfUpgradeAnalysisReportEntity } from "./self-upgrade-analysis-report.entity";
import { SelfUpgradePatchSetEntity } from "./self-upgrade-patch-set.entity";

/**
 * Admin preview package: DB-backed review space — not the sandbox filesystem and not production.
 * Holds denormalized snapshots so the review UI never depends on vague summaries alone.
 */
export type SelfUpgradePreviewStatus =
  | "draft"
  | "ready"
  | "revision_requested"
  | "rejected"
  | "approved_apply"
  | "superseded"
  | "applied";

@Entity({ name: "self_upgrade_review_sessions" })
export class SelfUpgradeReviewSessionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @ManyToOne(() => SelfUpgradeRequestEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "request_id" })
  request!: SelfUpgradeRequestEntity;

  @ManyToOne(() => SelfUpgradeAnalysisReportEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "analysis_report_id" })
  analysisReport!: SelfUpgradeAnalysisReportEntity;

  @ManyToOne(() => SelfUpgradePatchSetEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "patch_set_id" })
  patchSet!: SelfUpgradePatchSetEntity;

  @Index()
  @Column({ type: "varchar", length: 32, name: "preview_status", default: "draft" })
  previewStatus!: SelfUpgradePreviewStatus;

  @Column({ type: "json", name: "changed_files" })
  changedFiles!: Record<string, unknown>;

  @Column({ type: "text", name: "diff_summary" })
  diffSummary!: string;

  @Column({ type: "json", name: "validation_summary" })
  validationSummary!: Record<string, unknown>;

  @Column({ type: "text", name: "risk_summary" })
  riskSummary!: string;

  @Column({ type: "text", name: "rollback_summary" })
  rollbackSummary!: string;

  @Column({ type: "boolean", name: "ready_for_apply", default: false })
  readyForApply!: boolean;

  @Column({ type: "text", name: "admin_notes", nullable: true })
  adminNotes?: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
