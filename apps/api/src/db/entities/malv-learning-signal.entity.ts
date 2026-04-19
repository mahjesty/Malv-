import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from "typeorm";
import type { MalvLearningSignalEventType } from "../../malv-learning/malv-learning.types";

@Entity({ name: "malv_learning_signal" })
export class MalvLearningSignalEntity {
  @PrimaryColumn({ type: "char", length: 36, name: "id" })
  id!: string;

  @Index()
  @Column({ type: "char", length: 36, name: "user_id", nullable: true })
  userId!: string | null;

  @Index()
  @Column({ type: "varchar", length: 48, name: "event_type" })
  eventType!: MalvLearningSignalEventType;

  @Column({ type: "json", name: "context_json" })
  contextJson!: Record<string, unknown>;

  @Index()
  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
