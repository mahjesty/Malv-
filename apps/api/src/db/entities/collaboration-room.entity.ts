import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryColumn,
  RelationId,
  UpdateDateColumn
} from "typeorm";
import { UserEntity } from "./user.entity";
import { ConversationEntity } from "./conversation.entity";

@Entity({ name: "collaboration_rooms" })
export class CollaborationRoomEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "owner_user_id" })
  owner!: UserEntity;

  @Index()
  @Column({ type: "varchar", length: 160, name: "title", nullable: true })
  title?: string | null;

  @Column({ type: "boolean", name: "malv_enabled", default: true })
  malvEnabled!: boolean;

  /**
   * Shared Operator thread for this room (lazy-created).
   * FK is `conversation_id` — owned by `sharedConversation` only (no duplicate @Column on the same name).
   */
  @OneToOne(() => ConversationEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "conversation_id" })
  sharedConversation?: ConversationEntity | null;

  /** FK id for queries (`where: { conversationId }`) without duplicating the column in metadata. */
  @RelationId((room: CollaborationRoomEntity) => room.sharedConversation)
  conversationId?: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}
