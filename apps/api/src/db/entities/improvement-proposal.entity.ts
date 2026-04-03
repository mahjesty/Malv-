import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { UserEntity } from "./user.entity";

export type ImprovementProposalStatus = "pending" | "approved" | "rejected" | "applied";

@Entity({ name: "improvement_proposals" })
export class ImprovementProposalEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "text", name: "description" })
  description!: string;

  @Column({ type: "varchar", length: 64, name: "affected_system" })
  affectedSystem!: string;

  @Column({ type: "json", name: "suggestion" })
  suggestion!: Record<string, unknown>;

  @Column({ type: "double", name: "confidence", default: 0.5 })
  confidence!: number;

  @Index()
  @Column({ type: "varchar", length: 20, name: "status", default: "pending" })
  status!: ImprovementProposalStatus;

  @Column({ type: "json", name: "correlation_ids", nullable: true })
  correlationIds?: string[] | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @Column({ type: "datetime", precision: 3, name: "decided_at", nullable: true })
  decidedAt?: Date | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "decided_by_user_id" })
  decidedBy?: UserEntity | null;

  @Column({ type: "text", name: "rejection_reason", nullable: true })
  rejectionReason?: string | null;

  @Column({ type: "json", name: "applied_payload", nullable: true })
  appliedPayload?: Record<string, unknown> | null;

  @Column({ type: "datetime", precision: 3, name: "applied_at", nullable: true })
  appliedAt?: Date | null;
}
