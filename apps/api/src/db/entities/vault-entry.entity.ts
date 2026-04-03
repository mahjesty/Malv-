import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, ManyToOne, JoinColumn, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { VaultSessionEntity } from "./vault-session.entity";
import { UserEntity } from "./user.entity";

export type VaultEntryType = "secret" | "note" | "document" | "media";

@Entity({ name: "vault_entries" })
export class VaultEntryEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => VaultSessionEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "vault_session_id" })
  vaultSession!: VaultSessionEntity;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Index()
  @Column({ type: "varchar", length: 40, name: "entry_type", default: "note" })
  entryType!: VaultEntryType;

  @Column({ type: "varchar", length: 160, name: "label", nullable: true })
  label?: string | null;

  @Column({ type: "text", name: "content" })
  content!: string;

  @Column({ type: "mediumtext", name: "content_ciphertext", nullable: true })
  contentCiphertext?: string | null;

  @Column({ type: "varchar", length: 64, name: "content_iv", nullable: true })
  contentIv?: string | null;

  @Column({ type: "varchar", length: 64, name: "content_tag", nullable: true })
  contentTag?: string | null;

  @Column({ type: "mediumtext", name: "wrapped_dek", nullable: true })
  wrappedDek?: string | null;

  @Column({ type: "varchar", length: 64, name: "wrapped_dek_iv", nullable: true })
  wrappedDekIv?: string | null;

  @Column({ type: "varchar", length: 64, name: "wrapped_dek_tag", nullable: true })
  wrappedDekTag?: string | null;

  @Column({ type: "int", name: "key_version", nullable: true })
  keyVersion?: number | null;

  @Column({ type: "varchar", length: 40, name: "encryption_alg", nullable: true })
  encryptionAlg?: string | null;

  @Column({ type: "datetime", name: "encrypted_at", nullable: true })
  encryptedAt?: Date | null;

  @Column({ type: "json", name: "metadata", nullable: true })
  metadata?: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}

