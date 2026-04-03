import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from "typeorm";
import { UserEntity } from "./user.entity";

export type AuditEventLevel = "info" | "warn" | "error";

@Entity({ name: "audit_events" })
export class AuditEventEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "actor_user_id" })
  actorUser?: UserEntity | null;

  @Column({ type: "varchar", length: 100, name: "event_type" })
  eventType!: string;

  @Column({ type: "varchar", length: 20, name: "level", default: "info" })
  level!: AuditEventLevel;

  @Column({ type: "text", name: "message", nullable: true })
  message?: string | null;

  @Column({ type: "json", name: "metadata", nullable: true })
  metadata?: Record<string, unknown> | null;

  @CreateDateColumn({ name: "occurred_at" })
  occurredAt!: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}

