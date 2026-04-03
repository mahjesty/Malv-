import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import type { SecurityAuditSeverity } from "./security-audit-event.entity";

export type SecurityIncidentStatus = "open" | "investigating" | "resolved";

@Entity({ name: "security_incidents" })
export class SecurityIncidentEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 512, name: "title" })
  title!: string;

  @Index()
  @Column({ type: "varchar", length: 16, name: "severity" })
  severity!: SecurityAuditSeverity;

  @Index()
  @Column({ type: "varchar", length: 24, name: "status", default: "open" })
  status!: SecurityIncidentStatus;

  /** Stable key to avoid duplicate open incidents for the same correlation cluster. */
  @Index()
  @Column({ type: "varchar", length: 128, name: "dedup_key" })
  dedupKey!: string;

  @Index()
  @Column({ type: "varchar", length: 64, name: "correlation_id", nullable: true })
  correlationId?: string | null;

  @Column({ type: "varchar", length: 64, name: "source_subsystem", nullable: true })
  sourceSubsystem?: string | null;

  @Column({ type: "text", name: "summary" })
  summary!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
