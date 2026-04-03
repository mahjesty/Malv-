import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { ChangeRequestEntity } from "./change-request.entity";

@Entity({ name: "change_audits" })
export class ChangeAuditEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @ManyToOne(() => ChangeRequestEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "change_request_id" })
  changeRequest!: ChangeRequestEntity;

  @Column({ type: "text", name: "summary" })
  summary!: string;

  @Column({ type: "json", name: "impacted_areas" })
  impactedAreas!: Record<string, unknown>;

  @Column({ type: "json", name: "related_files" })
  relatedFiles!: string[];

  @Column({ type: "text", name: "architecture_notes" })
  architectureNotes!: string;

  @Column({ type: "text", name: "risk_notes" })
  riskNotes!: string;

  @Column({ type: "text", name: "security_notes" })
  securityNotes!: string;

  /** Repo graph snapshot + impact (nullable for rows created before migration 034). */
  @Column({ type: "json", name: "repo_intelligence_json", nullable: true })
  repoIntelligence!: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
