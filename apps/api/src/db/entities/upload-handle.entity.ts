import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { UserEntity } from "./user.entity";

export type UploadHandleStatus = "pending" | "consumed" | "expired";

@Entity({ name: "upload_handles" })
export class UploadHandleEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Index()
  @Column({ type: "varchar", length: 30, default: "pending" })
  status!: UploadHandleStatus;

  @Column({ type: "varchar", length: 500, name: "storage_uri" })
  storageUri!: string;

  @Column({ type: "varchar", length: 255, name: "original_name" })
  originalName!: string;

  @Column({ type: "varchar", length: 100, name: "mime_type", nullable: true })
  mimeType?: string | null;

  @Column({ type: "bigint", name: "size_bytes", nullable: true })
  sizeBytes?: string | null;

  @Column({ type: "char", length: 64, name: "checksum", nullable: true })
  checksum?: string | null;

  @Column({ type: "json", name: "metadata", nullable: true })
  metadata?: Record<string, unknown> | null;

  @Column({ type: "datetime", name: "expires_at" })
  expiresAt!: Date;

  @Column({ type: "datetime", name: "consumed_at", nullable: true })
  consumedAt?: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
