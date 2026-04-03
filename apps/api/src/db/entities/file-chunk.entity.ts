import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { FileEntity } from "./file.entity";
import { UserEntity } from "./user.entity";

@Entity({ name: "file_chunks" })
export class FileChunkEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @ManyToOne(() => FileEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "file_id" })
  file!: FileEntity;

  @Index()
  @Column({ type: "int", name: "chunk_index" })
  chunkIndex!: number;

  @Column({ type: "text", name: "content" })
  content!: string;

  @Column({ type: "int", name: "token_estimate", default: 0 })
  tokenEstimate!: number;

  @Column({ type: "json", name: "metadata", nullable: true })
  metadata?: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}

