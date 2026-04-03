import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { ChangeRequestEntity } from "./change-request.entity";

@Entity({ name: "change_plans" })
export class ChangePlanEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @ManyToOne(() => ChangeRequestEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "change_request_id" })
  changeRequest!: ChangeRequestEntity;

  @Column({ type: "text", name: "plan_summary" })
  planSummary!: string;

  @Column({ type: "json", name: "files_to_modify" })
  filesToModify!: string[];

  @Column({ type: "json", name: "files_to_create" })
  filesToCreate!: string[];

  @Column({ type: "boolean", name: "migrations_required", default: false })
  migrationsRequired!: boolean;

  @Column({ type: "text", name: "test_plan" })
  testPlan!: string;

  @Column({ type: "text", name: "rollback_notes" })
  rollbackNotes!: string;

  @Column({ type: "boolean", name: "approval_required", default: false })
  approvalRequired!: boolean;

  /** Rich plan: strategy, verification preview, visual strategy, design audit snapshot, etc. */
  @Column({ type: "json", name: "plan_intelligence_json", nullable: true })
  planIntelligence!: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
