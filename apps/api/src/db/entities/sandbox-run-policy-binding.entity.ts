import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { SandboxRunEntity } from "./sandbox-run.entity";
import { PolicyDefinitionEntity } from "./policy-definition.entity";
import { PolicyVersionEntity } from "./policy-version.entity";

@Entity({ name: "sandbox_run_policy_bindings" })
export class SandboxRunPolicyBindingEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @ManyToOne(() => SandboxRunEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "sandbox_run_id" })
  sandboxRun!: SandboxRunEntity;

  @Index()
  @ManyToOne(() => PolicyDefinitionEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "policy_definition_id" })
  policyDefinition!: PolicyDefinitionEntity;

  @Index()
  @ManyToOne(() => PolicyVersionEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "policy_version_id" })
  policyVersion!: PolicyVersionEntity;

  @Column({ type: "varchar", length: 120, name: "binding_reason" })
  bindingReason!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}

