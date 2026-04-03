import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

export type PolicyScope = "default" | "workspace" | "project";
export type PolicyStatus = "active" | "disabled";

@Entity({ name: "policy_definitions" })
export class PolicyDefinitionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "varchar", length: 160, name: "name" })
  name!: string;

  @Index()
  @Column({ type: "varchar", length: 60, name: "scope" })
  scope!: PolicyScope;

  @Index()
  @Column({ type: "varchar", length: 30, name: "status", default: "active" })
  status!: PolicyStatus;

  @Column({ type: "text", name: "description", nullable: true })
  description?: string | null;

  @Column({ type: "varchar", length: 120, name: "created_by", nullable: true })
  createdBy?: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}

