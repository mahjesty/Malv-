import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { PolicyVersionEntity } from "./policy-version.entity";
import { SandboxRunEntity } from "./sandbox-run.entity";
import { SandboxTypedActionEntity } from "./sandbox-typed-action.entity";

@Entity({ name: "sandbox_typed_action_policy_decisions" })
export class SandboxTypedActionPolicyDecisionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @ManyToOne(() => SandboxTypedActionEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "sandbox_typed_action_id" })
  sandboxTypedAction!: SandboxTypedActionEntity;

  @Index()
  @ManyToOne(() => SandboxRunEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "sandbox_run_id" })
  sandboxRun!: SandboxRunEntity;

  @Index()
  @ManyToOne(() => PolicyVersionEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "policy_version_id" })
  policyVersion!: PolicyVersionEntity;

  @Column({ type: "varchar", length: 40, name: "requested_action_type" })
  requestedActionType!: string;

  @Column({ type: "json", name: "requested_parameters_json" })
  requestedParametersJson!: Record<string, unknown>;

  @Column({ type: "json", name: "normalized_parameters_json" })
  normalizedParametersJson!: Record<string, unknown>;

  @Column({ type: "varchar", length: 40, name: "action_category" })
  actionCategory!: string;

  @Column({ type: "varchar", length: 20, name: "risk_level" })
  riskLevel!: string;

  @Column({ type: "varchar", length: 20, name: "decision" })
  decision!: "allow" | "deny" | "require_approval" | "rewrite";

  @Column({ type: "text", name: "decision_reason" })
  decisionReason!: string;

  @Column({ type: "varchar", length: 120, name: "matched_rule_id", nullable: true })
  matchedRuleId?: string | null;

  @Column({ type: "json", name: "rewritten_parameters_json", nullable: true })
  rewrittenParametersJson?: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
