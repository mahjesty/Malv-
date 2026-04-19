import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { UserEntity } from "./user.entity";

@Entity({ name: "malv_user_notification" })
export class MalvUserNotificationEntity {
  @PrimaryColumn({ type: "char", length: 36, name: "id" })
  id!: string;

  @Index()
  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Column({ type: "varchar", length: 48, name: "kind" })
  kind!: string;

  @Column({ type: "varchar", length: 240, name: "title" })
  title!: string;

  @Column({ type: "text", name: "body", nullable: true })
  body?: string | null;

  @Column({ type: "json", name: "payload_json", nullable: true })
  payloadJson?: Record<string, unknown> | null;

  /** Primary delivery path that succeeded (truthful; never claims native OS unless implemented). */
  @Column({ type: "varchar", length: 40, name: "delivery_channel" })
  deliveryChannel!: string;

  @Column({ type: "json", name: "delivery_detail_json", nullable: true })
  deliveryDetailJson?: Record<string, unknown> | null;

  @Index()
  @Column({ type: "char", length: 36, name: "task_id", nullable: true })
  taskId?: string | null;

  @Column({ type: "varchar", length: 64, name: "correlation_id", nullable: true })
  correlationId?: string | null;

  @Index()
  @Column({ type: "datetime", precision: 3, name: "read_at", nullable: true })
  readAt?: Date | null;

  @CreateDateColumn({ name: "created_at", precision: 3 })
  createdAt!: Date;
}
