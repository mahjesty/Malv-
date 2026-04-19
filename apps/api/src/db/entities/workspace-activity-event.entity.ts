import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { UserEntity } from "./user.entity";

export type WorkspaceActivityType =
  | "task_created"
  | "task_updated"
  | "task_completed"
  | "task_assigned"
  | "approval_created"
  | "approval_decided"
  | "call_recap_ready"
  | "collaboration_summary_ready"
  | "task_reminder_delivered"
  | "task_execution_approval_required"
  | "task_execution_surfaced"
  | "task_execution_blocked"
  | "task_execution_failed"
  | "malv_bridge_capability_resolved"
  | "malv_external_dispatch_attempted"
  | "malv_external_dispatch_ack"
  | "malv_notification_delivery"
  | "malv_continuity_persisted";

@Entity({ name: "workspace_activity_events" })
export class WorkspaceActivityEventEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Index()
  @Column({ type: "varchar", length: 48, name: "activity_type" })
  activityType!: WorkspaceActivityType;

  @Index()
  @Column({ type: "varchar", length: 36, name: "workspace_id", nullable: true })
  workspaceId?: string | null;

  @Index()
  @Column({ type: "varchar", length: 36, name: "room_id", nullable: true })
  roomId?: string | null;

  @Index()
  @Column({ type: "varchar", length: 36, name: "conversation_id", nullable: true })
  conversationId?: string | null;

  @Column({ type: "varchar", length: 36, name: "entity_id", nullable: true })
  entityId?: string | null;

  @Column({ type: "varchar", length: 240, name: "title" })
  title!: string;

  @Column({ type: "json", name: "payload_json", nullable: true })
  payloadJson?: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
