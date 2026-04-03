import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { AiJobEntity } from "./ai-job.entity";

@Entity({ name: "ai_job_leases" })
export class AiJobLeaseEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => AiJobEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "ai_job_id" })
  aiJob!: AiJobEntity;

  @Index()
  @Column({ type: "varchar", length: 160, name: "owner_node" })
  ownerNode!: string;

  @Column({ type: "int", name: "owner_pid", nullable: true })
  ownerPid?: number | null;

  @Column({ type: "char", length: 64, name: "lease_token" })
  leaseToken!: string;

  @Index()
  @Column({ type: "datetime", name: "lease_expires_at" })
  leaseExpiresAt!: Date;

  @Column({ type: "datetime", name: "last_renewed_at" })
  lastRenewedAt!: Date;

  @Column({ type: "int", name: "steal_count", default: 0 })
  stealCount!: number;

  @Column({ type: "int", name: "version", default: 1 })
  version!: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}

