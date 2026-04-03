import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { UserEntity } from "./user.entity";
import { WorkspaceEntity } from "./workspace.entity";

export type OperatorTargetType = "file" | "symbol" | "page" | "issue" | "task" | "workspace" | "repository";

@Entity({ name: "operator_targets" })
export class OperatorTargetEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Index()
  @ManyToOne(() => WorkspaceEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "workspace_id" })
  workspace?: WorkspaceEntity | null;

  @Index()
  @Column({ type: "varchar", length: 20, name: "target_type" })
  targetType!: OperatorTargetType;

  @Column({ type: "varchar", length: 500, name: "canonical_ref" })
  canonicalRef!: string;

  @Column({ type: "decimal", precision: 5, scale: 4, name: "confidence_score", default: 0 })
  confidenceScore!: string;

  @Column({ type: "json", name: "resolution_metadata", nullable: true })
  resolutionMetadata?: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
