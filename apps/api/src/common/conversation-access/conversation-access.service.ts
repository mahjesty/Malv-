import { Injectable, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConversationEntity } from "../../db/entities/conversation.entity";
import { CollaborationRoomEntity } from "../../db/entities/collaboration-room.entity";
import { RoomMemberEntity } from "../../db/entities/room-member.entity";

/**
 * Resolves whether a user may read/write a conversation: personal owner OR member of the linked collaboration room.
 */
@Injectable()
export class ConversationAccessService {
  constructor(
    @InjectRepository(ConversationEntity) private readonly conversations: Repository<ConversationEntity>,
    @InjectRepository(CollaborationRoomEntity) private readonly rooms: Repository<CollaborationRoomEntity>,
    @InjectRepository(RoomMemberEntity) private readonly members: Repository<RoomMemberEntity>
  ) {}

  async assertRoomMember(userId: string, roomId: string): Promise<void> {
    const m = await this.members.findOne({
      where: { room: { id: roomId }, user: { id: userId } },
      relations: { room: true }
    });
    if (!m?.room || m.room.deletedAt) {
      throw new UnauthorizedException("Not a member of this room.");
    }
  }

  async getRoomIdForConversation(conversationId: string): Promise<string | null> {
    const room = await this.rooms.findOne({
      where: { conversationId },
      select: ["id"]
    });
    return room?.id ?? null;
  }

  /**
   * Returns the conversation if the user owns it OR is a member of the collaboration room that owns this thread.
   */
  async resolveConversationForParticipant(userId: string, conversationId: string): Promise<ConversationEntity> {
    const owned = await this.conversations.findOne({
      where: { id: conversationId, user: { id: userId } },
      relations: { user: true }
    });
    if (owned) return owned;

    const room = await this.rooms.findOne({
      where: { conversationId },
      relations: { owner: true }
    });
    if (!room || room.deletedAt) {
      throw new UnauthorizedException("Conversation not found or not owned by user.");
    }

    const m = await this.members.findOne({
      where: { room: { id: room.id }, user: { id: userId } }
    });
    if (!m) {
      throw new UnauthorizedException("Conversation not found or not owned by user.");
    }

    const conv = await this.conversations.findOne({
      where: { id: conversationId },
      relations: { user: true }
    });
    if (!conv) {
      throw new UnauthorizedException("Conversation not found or not owned by user.");
    }
    return conv;
  }
}
