import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { UserEntity } from "./user.entity";
import { FileEntity } from "./file.entity";
import { FileChunkEntity } from "./file-chunk.entity";

@Entity({ name: "file_embeddings" })
export class FileEmbeddingEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @ManyToOne(() => FileEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "file_id" })
  file!: FileEntity;

  @ManyToOne(() => FileChunkEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "file_chunk_id" })
  fileChunk!: FileChunkEntity;

  @Index()
  @Column({ type: "varchar", length: 80, name: "embedding_model" })
  embeddingModel!: string;

  @Column({ type: "json", name: "embedding_vector" })
  embeddingVector!: number[];

  @Column({ type: "json", name: "metadata", nullable: true })
  metadata?: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}

