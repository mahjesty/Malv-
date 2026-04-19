import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from "typeorm";
import { UserEntity } from "./user.entity";

export type MalvExternalDispatchStatus =
  | "pending_ws"
  | "awaiting_client_ack"
  | "accepted"
  | "rejected"
  | "failed"
  | "completed"
  | "superseded";

@Entity({ name: "malv_external_action_dispatch" })
export class MalvExternalActionDispatchEntity {
  @PrimaryColumn({ type: "char", length: 36, name: "id" })
  id!: string;

  @Index()
  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Index()
  @Column({ type: "char", length: 36, name: "task_id" })
  taskId!: string;

  @Column({ type: "varchar", length: 160, name: "request_key" })
  requestKey!: string;

  @Column({ type: "varchar", length: 64, name: "correlation_id" })
  correlationId!: string;

  @Column({ type: "varchar", length: 48, name: "action_kind" })
  actionKind!: string;

  @Column({ type: "json", name: "action_payload_json", nullable: true })
  actionPayloadJson?: Record<string, unknown> | null;

  @Index()
  @Column({ type: "varchar", length: 32, name: "status" })
  status!: MalvExternalDispatchStatus;

  @Column({ type: "json", name: "result_json", nullable: true })
  resultJson?: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at", precision: 3 })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", precision: 3 })
  updatedAt!: Date;
}
