import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from "typeorm";

@Entity({ name: "kill_switch_events" })
export class KillSwitchEventEntity {
  // Supervisor-generated id (string uuid)
  @PrimaryColumn({ type: "char", length: 36, name: "external_event_id" })
  externalEventId!: string;

  @Index()
  @Column({ type: "boolean", name: "system_on" })
  systemOn!: boolean;

  @Column({ type: "boolean", name: "previous_system_on" })
  previousSystemOn!: boolean;

  @Column({ type: "varchar", length: 500, name: "reason" })
  reason!: string;

  @Column({ type: "varchar", length: 120, name: "actor" })
  actor!: string;

  @Index()
  @Column({ type: "datetime", name: "occurred_at" })
  occurredAt!: Date;

  @CreateDateColumn({ name: "persisted_at", type: "datetime" })
  persistedAt!: Date;
}

