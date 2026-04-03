import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { UserEntity } from "./user.entity";

@Entity({ name: "trusted_devices" })
export class TrustedDeviceEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Index()
  @Column({ type: "varchar", length: 255, name: "device_fingerprint" })
  deviceFingerprint!: string;

  @Column({ type: "varchar", length: 255, name: "device_label", nullable: true })
  deviceLabel?: string | null;

  @Column({ type: "boolean", default: true, name: "is_trusted" })
  isTrusted!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}

