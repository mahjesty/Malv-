import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { CollaborationRoomEntity } from "./collaboration-room.entity";

export type MemoryScope = "session" | "long_term" | "project" | "device" | "vault_only" | "collaboration";
export type MemorySource = "chat" | "support" | "device" | "system" | "vault";

@Entity({ name: "memory_entries" })
export class MemoryEntryEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "char", length: 36, name: "user_id" })
  userId!: string;

  @Index()
  @Column({ type: "varchar", length: 40, name: "memory_scope" })
  memoryScope!: MemoryScope;

  @Index()
  @ManyToOne(() => CollaborationRoomEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "collaboration_room_id" })
  collaborationRoom?: CollaborationRoomEntity | null;

  @Index()
  @Column({ type: "varchar", length: 60, name: "memory_type", default: "note" })
  memoryType!: string;

  @Column({ type: "varchar", length: 160, name: "title", nullable: true })
  title?: string | null;

  @Column({ type: "text", name: "content" })
  content!: string;

  @Column({ type: "json", name: "tags", nullable: true })
  tags?: string[] | null;

  @Column({ type: "varchar", length: 40, name: "source", default: "system" })
  source!: MemorySource;

  @Column({ type: "json", name: "source_refs", nullable: true })
  sourceRefs?: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}

