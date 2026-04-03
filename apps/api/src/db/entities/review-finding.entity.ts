import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { ReviewSessionEntity } from "./review-session.entity";
import { SandboxPatchProposalEntity } from "./sandbox-patch-proposal.entity";

export type ReviewFindingSeverity = "low" | "medium" | "high" | "critical";
export type ReviewFindingCategory = "bug" | "security" | "performance" | "maintainability" | "logic" | "ux" | "architecture";

@Entity({ name: "review_findings" })
export class ReviewFindingEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => ReviewSessionEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "review_session_id" })
  reviewSession!: ReviewSessionEntity;

  @Index()
  @Column({ type: "varchar", length: 20, name: "severity" })
  severity!: ReviewFindingSeverity;

  @Index()
  @Column({ type: "varchar", length: 30, name: "category" })
  category!: ReviewFindingCategory;

  @Column({ type: "varchar", length: 255, name: "title" })
  title!: string;

  @Column({ type: "text", name: "explanation" })
  explanation!: string;

  @Column({ type: "text", name: "evidence", nullable: true })
  evidence?: string | null;

  @Column({ type: "text", name: "suggested_fix", nullable: true })
  suggestedFix?: string | null;

  @ManyToOne(() => SandboxPatchProposalEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "patch_proposal_id" })
  patchProposal?: SandboxPatchProposalEntity | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
