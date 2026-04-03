import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { SandboxCommandRecordEntity } from "./sandbox-command-record.entity";
import { SandboxRunEntity } from "./sandbox-run.entity";
import { PolicyVersionEntity } from "./policy-version.entity";

export type PolicyDecision = "allow" | "deny" | "require_approval" | "rewrite";

@Entity({ name: "sandbox_command_policy_decisions" })
export class SandboxCommandPolicyDecisionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @ManyToOne(() => SandboxCommandRecordEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "sandbox_command_record_id" })
  sandboxCommandRecord!: SandboxCommandRecordEntity;

  @Index()
  @ManyToOne(() => SandboxRunEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "sandbox_run_id" })
  sandboxRun!: SandboxRunEntity;

  @Index()
  @ManyToOne(() => PolicyVersionEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "policy_version_id" })
  policyVersion!: PolicyVersionEntity;

  @Column({ type: "text", name: "requested_command" })
  requestedCommand!: string;

  @Column({ type: "text", name: "normalized_command" })
  normalizedCommand!: string;

  @Index()
  @Column({ type: "varchar", length: 40, name: "command_category" })
  commandCategory!: string;

  @Index()
  @Column({ type: "varchar", length: 20, name: "risk_level" })
  riskLevel!: string;

  @Index()
  @Column({ type: "varchar", length: 20, name: "decision" })
  decision!: PolicyDecision;

  @Column({ type: "text", name: "decision_reason" })
  decisionReason!: string;

  @Column({ type: "varchar", length: 120, name: "matched_rule_id", nullable: true })
  matchedRuleId?: string | null;

  @Column({ type: "text", name: "rewritten_command", nullable: true })
  rewrittenCommand?: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}

