import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { SelfUpgradeRequestEntity } from "./self-upgrade-request.entity";

@Entity({ name: "self_upgrade_analysis_reports" })
export class SelfUpgradeAnalysisReportEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @ManyToOne(() => SelfUpgradeRequestEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "request_id" })
  request!: SelfUpgradeRequestEntity;

  /** Narrative + structured architecture understanding (study output). */
  @Column({ type: "json", name: "architecture_understanding" })
  architectureUnderstanding!: Record<string, unknown>;

  @Column({ type: "json", name: "files_examined" })
  filesExamined!: Record<string, unknown>;

  @Column({ type: "json", name: "affected_modules" })
  affectedModules!: Record<string, unknown>;

  @Column({ type: "json", name: "dependency_notes" })
  dependencyNotes!: Record<string, unknown>;

  @Column({ type: "text", name: "study_summary", nullable: true })
  studySummary?: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
