import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { SandboxRunEntity } from "./sandbox-run.entity";
import { SandboxCommandRecordEntity } from "./sandbox-command-record.entity";
import { SandboxCommandPolicyDecisionEntity } from "./sandbox-command-policy-decision.entity";
import { UserEntity } from "./user.entity";

export type ApprovalType = "command" | "patch" | "escalation";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "cancelled";

@Entity({ name: "sandbox_approval_requests" })
export class SandboxApprovalRequestEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @ManyToOne(() => SandboxRunEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "sandbox_run_id" })
  sandboxRun!: SandboxRunEntity;

  @Index()
  @ManyToOne(() => SandboxCommandRecordEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "sandbox_command_record_id" })
  sandboxCommandRecord?: SandboxCommandRecordEntity | null;

  @Index()
  @ManyToOne(() => SandboxCommandPolicyDecisionEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "sandbox_policy_decision_id" })
  sandboxPolicyDecision!: SandboxCommandPolicyDecisionEntity;

  @Index()
  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Index()
  @Column({ type: "varchar", length: 20, name: "approval_type" })
  approvalType!: ApprovalType;

  @Index()
  @Column({ type: "varchar", length: 20, name: "status", default: "pending" })
  status!: ApprovalStatus;

  @Column({ type: "text", name: "requested_command", nullable: true })
  requestedCommand?: string | null;

  @Column({ type: "text", name: "normalized_command", nullable: true })
  normalizedCommand?: string | null;

  @Index()
  @Column({ type: "varchar", length: 20, name: "risk_level", nullable: true })
  riskLevel?: string | null;

  @Column({ type: "text", name: "reason", nullable: true })
  reason?: string | null;

  @Column({ type: "int", name: "current_step_index", nullable: true })
  currentStepIndex?: number | null;

  @CreateDateColumn({ name: "requested_at" })
  requestedAt!: Date;

  @Column({ type: "datetime", name: "resolved_at", nullable: true })
  resolvedAt?: Date | null;

  @Column({ type: "varchar", length: 120, name: "resolved_by", nullable: true })
  resolvedBy?: string | null;

  @Column({ type: "text", name: "resolution_note", nullable: true })
  resolutionNote?: string | null;
}

