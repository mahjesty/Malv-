import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "intelligence_learning_memory" })
export class IntelligenceLearningMemoryEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "varchar", length: 128, name: "pattern_key" })
  patternKey!: string;

  @Index()
  @Column({ type: "varchar", length: 64, name: "category" })
  category!: string;

  @Column({ type: "varchar", length: 64, name: "issue_code", nullable: true })
  issueCode?: string | null;

  @Column({ type: "text", name: "fix_strategy" })
  fixStrategy!: string;

  @Column({ type: "varchar", length: 16, name: "outcome" })
  outcome!: "success" | "failed" | "partial" | "unknown";

  @Index()
  @Column({ type: "char", length: 36, name: "source_change_request_id", nullable: true })
  sourceChangeRequestId?: string | null;

  @Column({ type: "json", name: "metadata_json", nullable: true })
  metadataJson?: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
