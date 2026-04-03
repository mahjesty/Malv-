import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { ChangeRequestEntity } from "./change-request.entity";

@Entity({ name: "change_verification_reports" })
export class ChangeVerificationReportEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @ManyToOne(() => ChangeRequestEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "change_request_id" })
  changeRequest!: ChangeRequestEntity;

  @Column({ type: "text", name: "verification_summary" })
  verificationSummary!: string;

  @Column({ type: "json", name: "tests_run" })
  testsRun!: Array<Record<string, unknown>>;

  @Column({ type: "json", name: "checks_performed" })
  checksPerformed!: Array<Record<string, unknown>>;

  @Column({ type: "text", name: "proven_safe_areas" })
  provenSafeAreas!: string;

  @Column({ type: "text", name: "unproven_areas" })
  unprovenAreas!: string;

  @Column({ type: "text", name: "regression_notes" })
  regressionNotes!: string;

  @Column({ type: "json", name: "quality_json", nullable: true })
  quality!: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
