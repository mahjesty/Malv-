import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { ChangeRequestEntity } from "./change-request.entity";

@Entity({ name: "change_patch_reviews" })
export class ChangePatchReviewEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @ManyToOne(() => ChangeRequestEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "change_request_id" })
  changeRequest!: ChangeRequestEntity;

  @Column({ type: "text", name: "review_summary" })
  reviewSummary!: string;

  @Column({ type: "json", name: "issues_found" })
  issuesFound!: Array<Record<string, unknown>>;

  @Column({ type: "json", name: "issues_fixed" })
  issuesFixed!: Array<Record<string, unknown>>;

  @Column({ type: "text", name: "residual_risks" })
  residualRisks!: string;

  @Column({ type: "json", name: "review_metadata_json", nullable: true })
  reviewMetadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
