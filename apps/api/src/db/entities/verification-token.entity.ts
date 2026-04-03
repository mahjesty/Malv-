import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

export type VerificationTokenType = "email_verification" | "password_reset" | "trusted_device_otp";

@Entity({ name: "verification_tokens" })
export class VerificationTokenEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "char", length: 36, name: "user_id" })
  userId!: string;

  @Index()
  @Column({ type: "varchar", length: 40, name: "token_type" })
  tokenType!: VerificationTokenType;

  @Index()
  @Column({ type: "char", length: 64, name: "token_hash" })
  tokenHash!: string;

  @Column({ type: "datetime", name: "expires_at" })
  expiresAt!: Date;

  @Column({ type: "datetime", name: "consumed_at", nullable: true })
  consumedAt?: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}

