import { CreateDateColumn, Entity, Index, PrimaryColumn } from "typeorm";

@Entity({ name: "security_incident_events" })
export class SecurityIncidentEventEntity {
  @PrimaryColumn("uuid", { name: "incident_id" })
  incidentId!: string;

  @PrimaryColumn("uuid", { name: "security_audit_event_id" })
  @Index()
  securityAuditEventId!: string;

  @CreateDateColumn({ name: "added_at" })
  addedAt!: Date;
}
