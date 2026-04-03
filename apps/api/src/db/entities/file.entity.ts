import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";
import { UserEntity } from "./user.entity";
import { WorkspaceEntity } from "./workspace.entity";
import { CollaborationRoomEntity } from "./collaboration-room.entity";

export type FileKind = "pdf" | "image" | "audio" | "video" | "doc" | "text";

@Entity({ name: "files" })
export class FileEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Index()
  @ManyToOne(() => WorkspaceEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "workspace_id" })
  workspace?: WorkspaceEntity | null;

  @Index()
  @ManyToOne(() => CollaborationRoomEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "collaboration_room_id" })
  collaborationRoom?: CollaborationRoomEntity | null;

  @Index()
  @Column({ type: "varchar", length: 30, name: "file_kind" })
  fileKind!: FileKind;

  @Index()
  @Column({ type: "varchar", length: 255, name: "original_name" })
  originalName!: string;

  @Column({ type: "varchar", length: 100, name: "mime_type", nullable: true })
  mimeType?: string | null;

  @Column({ type: "bigint", name: "size_bytes", nullable: true })
  sizeBytes?: string | null;

  @Index()
  @Column({ type: "varchar", length: 500, name: "storage_uri" })
  storageUri!: string;

  @Column({ type: "char", length: 64, name: "checksum", nullable: true })
  checksum?: string | null;

  @Column({ type: "json", name: "metadata", nullable: true })
  metadata?: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}

