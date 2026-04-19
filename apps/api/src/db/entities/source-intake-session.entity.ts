import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";

/** Lifecycle while the uploaded bytes are analyzed (stub or real pipeline). */
export type SourceIntakeSessionStatus =
  | "uploaded"
  | "detecting"
  | "auditing"
  | "approved"
  | "approved_with_warnings"
  | "declined";

/** Policy outcome before any build_unit row exists. */
export type SourceIntakeAuditDecision = "pending" | "approved" | "approved_with_warnings" | "declined";

/** Whether a code-derived preview artifact or live surface is available. */
export type SourceIntakePreviewState = "not_requested" | "queued" | "ready" | "unavailable";

@Entity({ name: "source_intake_sessions" })
export class SourceIntakeSessionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "varchar", length: 36, name: "user_id" })
  userId!: string;

  @Index()
  @Column({ type: "varchar", length: 32, name: "status" })
  status!: SourceIntakeSessionStatus;

  @Index()
  @Column({ type: "varchar", length: 32, name: "audit_decision" })
  auditDecision!: SourceIntakeAuditDecision;

  @Index()
  @Column({
    type: "char",
    length: 36,
    name: "source_file_id",
    collation: "utf8mb4_general_ci"
  })
  sourceFileId!: string;

  @Column({ type: "json", name: "detection_json", nullable: true })
  detectionJson!: Record<string, unknown> | null;

  @Column({ type: "json", name: "audit_json", nullable: true })
  auditJson!: Record<string, unknown> | null;

  /** Short, truthful outcome line for clients (e.g. policy summary — not a malware claim). */
  @Column({ type: "text", name: "audit_summary", nullable: true })
  auditSummary!: string | null;

  @Column({ type: "varchar", length: 24, name: "preview_state" })
  previewState!: SourceIntakePreviewState;

  @Column({ type: "text", name: "preview_unavailable_reason", nullable: true })
  previewUnavailableReason!: string | null;

  @Index()
  @Column({ type: "varchar", length: 36, name: "build_unit_id", nullable: true })
  buildUnitId!: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
