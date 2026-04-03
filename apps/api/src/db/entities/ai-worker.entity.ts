import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

export type AiWorkerType = "beast" | "job_runner";
export type AiWorkerStatus = "online" | "offline";

@Entity({ name: "ai_workers" })
export class AiWorkerEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "varchar", length: 40, name: "worker_type" })
  workerType!: AiWorkerType;

  @Index()
  @Column({ type: "varchar", length: 160, name: "node_name" })
  nodeName!: string;

  @Column({ type: "varchar", length: 255, name: "base_url" })
  baseUrl!: string;

  @Column({ type: "varchar", length: 60, name: "status", default: "online" })
  status!: AiWorkerStatus;

  @Column({ type: "json", name: "capabilities", nullable: true })
  capabilities?: Record<string, unknown> | null;

  @Index()
  @Column({ type: "datetime", name: "last_seen_at" })
  lastSeenAt!: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}

