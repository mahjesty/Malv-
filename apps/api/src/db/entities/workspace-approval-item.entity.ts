import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { UserEntity } from "./user.entity";

export type WorkspaceApprovalStatus = "pending" | "approved" | "rejected";
export type WorkspaceApprovalRiskLevel = "low" | "medium" | "high" | "critical";
export type WorkspaceApprovalSource = "sandbox" | "device" | "other";

@Entity({ name: "workspace_approval_items" })
@Index("ix_workspace_approvals_user_source_ref_unique", ["user", "source", "sourceRefId"], { unique: true })
export class WorkspaceApprovalItemEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Index()
  @Column({ type: "varchar", length: 20, name: "source", default: "other" })
  source!: WorkspaceApprovalSource;

  @Index()
  @Column({ type: "varchar", length: 64, name: "source_ref_id", nullable: true })
  sourceRefId?: string | null;

  @Column({ type: "text", name: "action_description" })
  actionDescription!: string;

  @Index()
  @Column({ type: "varchar", length: 20, name: "risk_level", default: "medium" })
  riskLevel!: WorkspaceApprovalRiskLevel;

  @Index()
  @Column({ type: "varchar", length: 20, name: "status", default: "pending" })
  status!: WorkspaceApprovalStatus;

  @Index()
  @Column({ type: "varchar", length: 36, name: "conversation_id", nullable: true })
  conversationId?: string | null;

  @Index()
  @Column({ type: "varchar", length: 36, name: "call_session_id", nullable: true })
  callSessionId?: string | null;

  @Index()
  @Column({ type: "varchar", length: 36, name: "room_id", nullable: true })
  roomId?: string | null;

  @Column({ type: "varchar", length: 120, name: "resolved_by", nullable: true })
  resolvedBy?: string | null;

  @Column({ type: "datetime", name: "resolved_at", nullable: true })
  resolvedAt?: Date | null;

  @Column({ type: "json", name: "metadata", nullable: true })
  metadata?: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
