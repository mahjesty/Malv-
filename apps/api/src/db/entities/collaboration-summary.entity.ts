import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { ConversationEntity } from "./conversation.entity";
import { CollaborationRoomEntity } from "./collaboration-room.entity";
import { UserEntity } from "./user.entity";

export type CollaborationSummaryTrigger = "message_threshold" | "inactivity_window";

@Entity({ name: "collaboration_summaries" })
export class CollaborationSummaryEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @ManyToOne(() => CollaborationRoomEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "room_id" })
  room!: CollaborationRoomEntity;

  @Index()
  @ManyToOne(() => ConversationEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "conversation_id" })
  conversation!: ConversationEntity;

  @Index()
  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "created_by_user_id" })
  createdByUser!: UserEntity;

  @Index()
  @Column({ type: "varchar", length: 36, name: "workspace_id", nullable: true })
  workspaceId?: string | null;

  @Index()
  @Column({ type: "varchar", length: 32, name: "trigger_kind" })
  triggerKind!: CollaborationSummaryTrigger;

  @Column({ type: "int", name: "message_count" })
  messageCount!: number;

  @Column({ type: "json", name: "summary_json" })
  summaryJson!: Record<string, unknown>;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
