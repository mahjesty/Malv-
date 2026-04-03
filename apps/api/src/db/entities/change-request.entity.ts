import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";
import { UserEntity } from "./user.entity";
import { WorkspaceEntity } from "./workspace.entity";

export type ChangeRequestStatus =
  | "queued"
  | "auditing"
  | "planning"
  | "implementing"
  | "verifying"
  | "reviewing"
  | "completed"
  | "blocked"
  | "failed";

export type ChangeRequestPriority = "low" | "normal" | "high" | "urgent";
export type ChangeTrustLevel = "safe" | "controlled" | "sensitive" | "critical";

@Entity({ name: "change_requests" })
export class ChangeRequestEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @ManyToOne(() => WorkspaceEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "workspace_id" })
  workspace?: WorkspaceEntity | null;

  @Index()
  @Column({ type: "char", length: 36, name: "source_message_id", nullable: true })
  sourceMessageId?: string | null;

  @Column({ type: "varchar", length: 200, name: "title" })
  title!: string;

  @Column({ type: "text", name: "requested_goal" })
  requestedGoal!: string;

  @Index()
  @Column({ type: "varchar", length: 32, name: "status", default: "queued" })
  status!: ChangeRequestStatus;

  @Index()
  @Column({ type: "varchar", length: 16, name: "priority", default: "normal" })
  priority!: ChangeRequestPriority;

  @Index()
  @Column({ type: "varchar", length: 16, name: "trust_level", default: "controlled" })
  trustLevel!: ChangeTrustLevel;

  @Column({ type: "boolean", name: "approval_required", default: false })
  approvalRequired!: boolean;

  @Column({ type: "datetime", name: "approved_at", nullable: true })
  approvedAt?: Date | null;

  @Column({ type: "varchar", length: 120, name: "approved_by", nullable: true })
  approvedBy?: string | null;

  @Column({ type: "json", name: "final_result_json", nullable: true })
  finalResultJson?: Record<string, unknown> | null;

  @Column({ type: "varchar", length: 16, name: "confidence_level", nullable: true })
  confidenceLevel?: "low" | "medium" | "high" | null;

  @Column({ type: "text", name: "failure_reason", nullable: true })
  failureReason?: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
