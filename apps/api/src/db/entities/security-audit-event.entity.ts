import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { UserEntity } from "./user.entity";

export type SecurityAuditSeverity = "low" | "medium" | "high" | "critical";

/**
 * Append-only security audit stream (no soft-delete; application layer must not update/delete).
 */
@Entity({ name: "security_audit_events" })
export class SecurityAuditEventEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "varchar", length: 120, name: "event_type" })
  eventType!: string;

  @Index()
  @Column({ type: "varchar", length: 16, name: "severity", default: "medium" })
  severity!: SecurityAuditSeverity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "actor_user_id" })
  actorUser?: UserEntity | null;

  @Column({ type: "varchar", length: 32, name: "actor_role", nullable: true })
  actorRole?: string | null;

  @Column({ type: "varchar", length: 64, name: "source_ip", nullable: true })
  sourceIp?: string | null;

  @Index()
  @Column({ type: "varchar", length: 64, name: "subsystem" })
  subsystem!: string;

  @Column({ type: "text", name: "summary" })
  summary!: string;

  @Column({ type: "json", name: "details_json", nullable: true })
  detailsJson?: Record<string, unknown> | null;

  @Index()
  @Column({ type: "varchar", length: 64, name: "correlation_id", nullable: true })
  correlationId?: string | null;

  @Index()
  @CreateDateColumn({ name: "occurred_at" })
  occurredAt!: Date;
}
