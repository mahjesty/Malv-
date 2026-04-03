import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { SandboxRunEntity } from "./sandbox-run.entity";
import { UserEntity } from "./user.entity";

@Entity({ name: "sandbox_policy_decisions" })
export class SandboxPolicyDecisionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => SandboxRunEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "sandbox_run_id" })
  sandboxRun!: SandboxRunEntity;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Index()
  @Column({ type: "int", name: "step_index" })
  stepIndex!: number;

  @Column({ type: "varchar", length: 20, name: "decision" })
  decision!: "allow" | "deny" | "require_approval";

  @Column({ type: "varchar", length: 120, name: "reason_code" })
  reasonCode!: string;

  @Column({ type: "json", name: "metadata", nullable: true })
  metadata?: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}

