import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { UserEntity } from "./user.entity";

@Entity({ name: "reflection_events" })
export class ReflectionEventEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Index()
  @Column({ type: "varchar", length: 36, name: "correlation_id" })
  correlationId!: string;

  @Column({ type: "varchar", length: 64, name: "task_type" })
  taskType!: string;

  @Column({ type: "boolean", name: "success" })
  success!: boolean;

  @Column({ type: "int", name: "latency_ms" })
  latencyMs!: number;

  @Column({ type: "varchar", length: 64, name: "error_class", nullable: true })
  errorClass?: string | null;

  @Column({ type: "text", name: "summary", nullable: true })
  summary?: string | null;

  @Column({ type: "json", name: "metadata", nullable: true })
  metadata?: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
