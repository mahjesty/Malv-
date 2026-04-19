import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, Unique, UpdateDateColumn } from "typeorm";
import { UserEntity } from "./user.entity";

export type MalvExecutorEnrollmentChannel = "browser" | "desktop" | "mobile";

@Entity({ name: "malv_user_executor_enrollment" })
@Unique(["user", "channel"])
export class MalvUserExecutorEnrollmentEntity {
  @PrimaryColumn({ type: "char", length: 36 })
  id!: string;

  @Index()
  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Column({ type: "varchar", length: 24, name: "channel" })
  channel!: MalvExecutorEnrollmentChannel;

  /** Opaque device id from the agent (optional). */
  @Column({ type: "varchar", length: 128, name: "device_id", nullable: true })
  deviceId!: string | null;

  @Index()
  @Column({ type: "datetime", precision: 3, name: "last_heartbeat_at" })
  lastHeartbeatAt!: Date;

  @CreateDateColumn({ name: "created_at", precision: 3 })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", precision: 3 })
  updatedAt!: Date;
}
