import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { UserEntity } from "./user.entity";
import { RefreshTokenEntity } from "./refresh-token.entity";
import { TrustedDeviceEntity } from "./trusted-device.entity";

export type SessionStatus = "active" | "revoked" | "expired";

@Entity({ name: "sessions" })
export class SessionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @ManyToOne(() => TrustedDeviceEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "trusted_device_id" })
  trustedDevice?: TrustedDeviceEntity | null;

  @ManyToOne(() => RefreshTokenEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "refresh_token_id" })
  refreshToken?: RefreshTokenEntity | null;

  @Index()
  @Column({ type: "varchar", length: 20, name: "status", default: "active" })
  status!: SessionStatus;

  @Column({ type: "varchar", length: 64, name: "ip_address", nullable: true })
  ipAddress?: string | null;

  @Column({ type: "varchar", length: 255, name: "user_agent", nullable: true })
  userAgent?: string | null;

  @Column({ type: "datetime", name: "expires_at" })
  expiresAt!: Date;

  @Column({ type: "datetime", name: "last_seen_at" })
  lastSeenAt!: Date;

  @Column({ type: "datetime", name: "revoked_at", nullable: true })
  revokedAt?: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}

