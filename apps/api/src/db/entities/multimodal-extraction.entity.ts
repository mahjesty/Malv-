import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { UserEntity } from "./user.entity";
import { FileEntity } from "./file.entity";
import { WorkspaceEntity } from "./workspace.entity";
import { AiJobEntity } from "./ai-job.entity";

export type MultimodalModality = "pdf" | "image" | "audio" | "video" | "other";
export type MultimodalExtractionStatus = "queued" | "processing" | "completed" | "failed";

@Entity({ name: "multimodal_extractions" })
export class MultimodalExtractionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Index()
  @ManyToOne(() => FileEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "file_id" })
  file!: FileEntity;

  @Index()
  @ManyToOne(() => WorkspaceEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "workspace_id" })
  workspace?: WorkspaceEntity | null;

  @Index()
  @ManyToOne(() => AiJobEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "ai_job_id" })
  aiJob?: AiJobEntity | null;

  @Column({ type: "varchar", length: 20, name: "modality" })
  modality!: MultimodalModality;

  @Index()
  @Column({ type: "varchar", length: 20, name: "status", default: "queued" })
  status!: MultimodalExtractionStatus;

  @Column({ type: "json", name: "unified_result", nullable: true })
  unifiedResult?: Record<string, unknown> | null;

  @Column({ type: "longtext", name: "retrieval_text", nullable: true })
  retrievalText?: string | null;

  @Column({ type: "json", name: "sections_json", nullable: true })
  sectionsJson?: Record<string, unknown> | null;

  @Column({ type: "json", name: "page_meta_json", nullable: true })
  pageMetaJson?: Record<string, unknown> | null;

  @Column({ type: "json", name: "tables_figures_json", nullable: true })
  tablesFiguresJson?: Record<string, unknown> | null;

  @Column({ type: "json", name: "segment_meta_json", nullable: true })
  segmentMetaJson?: Record<string, unknown> | null;

  @Column({ type: "json", name: "image_analysis_json", nullable: true })
  imageAnalysisJson?: Record<string, unknown> | null;

  @Column({ type: "varchar", length: 120, name: "processor_version", nullable: true })
  processorVersion?: string | null;

  @Column({ type: "text", name: "error_message", nullable: true })
  errorMessage?: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
