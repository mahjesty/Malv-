import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { PolicyDefinitionEntity } from "./policy-definition.entity";

@Entity({ name: "policy_versions" })
export class PolicyVersionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => PolicyDefinitionEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "policy_definition_id" })
  policyDefinition!: PolicyDefinitionEntity;

  @Column({ type: "int", name: "version" })
  version!: number;

  @Column({ type: "json", name: "rules_json" })
  rulesJson!: Record<string, unknown>;

  @Index()
  @Column({ type: "varchar", length: 128, name: "hash" })
  hash!: string;

  @Index()
  @Column({ type: "boolean", name: "is_active", default: false })
  isActive!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}

