import { BadRequestException, ForbiddenException, forwardRef, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomUUID } from "crypto";
import { CollaborationRoomEntity } from "../db/entities/collaboration-room.entity";
import { RoomMemberEntity, type RoomMemberRole } from "../db/entities/room-member.entity";
import { UserEntity } from "../db/entities/user.entity";
import { KillSwitchService } from "../kill-switch/kill-switch.service";
import { ConversationEntity, type ConversationMode } from "../db/entities/conversation.entity";
import { AuthorizationService } from "../common/authorization/authorization.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";

@Injectable()
export class RoomsService {
  constructor(
    @InjectRepository(CollaborationRoomEntity) private readonly rooms: Repository<CollaborationRoomEntity>,
    @InjectRepository(RoomMemberEntity) private readonly members: Repository<RoomMemberEntity>,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(ConversationEntity) private readonly conversations: Repository<ConversationEntity>,
    private readonly killSwitch: KillSwitchService,
    private readonly authz: AuthorizationService,
    @Inject(forwardRef(() => RealtimeGateway)) private readonly realtime: RealtimeGateway
  ) {}

  private async ensureRoomSharedConversation(room: CollaborationRoomEntity): Promise<string> {
    if (room.conversationId) return room.conversationId;

    const mode: ConversationMode = "collaboration";
    const conversation = this.conversations.create({
      user: { id: room.owner.id } as any,
      title: room.title?.trim() ? room.title.trim().slice(0, 160) : "Collaboration thread",
      mode
    });
    await this.conversations.save(conversation);

    room.sharedConversation = conversation;
    await this.rooms.save(room);
    return conversation.id;
  }

  async createRoom(args: { ownerUserId: string; title?: string | null }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "collaboration_write" });

    const room = this.rooms.create({
      owner: { id: args.ownerUserId } as any,
      title: args.title?.trim() ? args.title.trim().slice(0, 160) : null,
      malvEnabled: true
    });
    room.id = randomUUID();
    await this.rooms.save(room);

    const ownerRow = this.members.create({
      id: randomUUID(),
      room,
      user: { id: args.ownerUserId } as any,
      role: "owner" as RoomMemberRole
    });
    await this.members.save(ownerRow);
    await this.ensureRoomSharedConversation({ ...room, owner: { id: args.ownerUserId } as any });

    return this.toRoomSummary(room);
  }

  async listRoomsForUser(args: { userId: string }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "collaboration_read" });

    const memberships = await this.members.find({
      where: { user: { id: args.userId } },
      relations: { room: true }
    });

    const active = memberships.filter((m) => m.room && !m.room.deletedAt);
    active.sort((a, b) => b.room.updatedAt.getTime() - a.room.updatedAt.getTime());

    return {
      rooms: active.map((m) => ({
        roomId: m.room.id,
        title: m.room.title ?? null,
        malvEnabled: Boolean(m.room.malvEnabled),
        yourRole: m.role,
        conversationId: m.room.conversationId ?? null,
        updatedAt: m.room.updatedAt.toISOString()
      }))
    };
  }

  private toRoomSummary(room: CollaborationRoomEntity) {
    return {
      roomId: room.id,
      title: room.title ?? null,
      malvEnabled: Boolean(room.malvEnabled),
      conversationId: room.conversationId ?? null,
      updatedAt: room.updatedAt.toISOString()
    };
  }

  async getRoom(args: { userId: string; roomId: string }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "collaboration_read" });

    const membership = await this.members.findOne({
      where: { room: { id: args.roomId }, user: { id: args.userId } },
      relations: { room: { owner: true } }
    });
    if (!membership?.room) throw new NotFoundException("Room not found.");

    // Ensure a shared chat thread exists for this room so members can open it.
    const conversationId = await this.ensureRoomSharedConversation(membership.room);

    const all = await this.members.find({
      where: { room: { id: args.roomId } },
      relations: { user: true },
      order: { createdAt: "ASC" }
    });

    return {
      room: {
        roomId: membership.room.id,
        title: membership.room.title ?? null,
        ownerUserId: membership.room.owner.id,
        malvEnabled: Boolean(membership.room.malvEnabled),
        conversationId,
        updatedAt: membership.room.updatedAt.toISOString()
      },
      yourRole: membership.role,
      members: all.map((m) => ({
        userId: m.user.id,
        displayName: m.user.displayName,
        role: m.role
      }))
    };
  }

  async assertMember(args: { userId: string; roomId: string }) {
    return await this.authz.assertRoomMemberOrThrow(args);
  }

  async listMemberUserIds(args: { roomId: string }) {
    const rows = await this.members.find({ where: { room: { id: args.roomId } }, relations: { user: true } });
    return rows.map((m) => m.user.id);
  }

  async addMember(args: { actorUserId: string; roomId: string; targetUserId: string }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "collaboration_write" });

    if (args.actorUserId === args.targetUserId) {
      throw new BadRequestException("You are already in this room.");
    }

    const room = await this.rooms.findOne({ where: { id: args.roomId }, relations: { owner: true } });
    if (!room || room.deletedAt) throw new NotFoundException("Room not found.");

    const actor = await this.members.findOne({
      where: { room: { id: args.roomId }, user: { id: args.actorUserId } }
    });
    if (!actor || actor.role !== "owner") {
      throw new ForbiddenException("Only the room owner can add members.");
    }

    const target = await this.users.findOne({ where: { id: args.targetUserId, isActive: true } });
    if (!target) throw new NotFoundException("User not found.");

    const existing = await this.members.findOne({
      where: { room: { id: args.roomId }, user: { id: args.targetUserId } }
    });
    if (existing) throw new BadRequestException("User is already a member.");

    const row = this.members.create({
      id: randomUUID(),
      room,
      user: target,
      role: "member"
    });
    await this.members.save(row);

    return { ok: true as const };
  }

  async leaveRoom(args: { userId: string; roomId: string }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "collaboration_write" });

    const m = await this.members.findOne({
      where: { room: { id: args.roomId }, user: { id: args.userId } },
      relations: { room: true }
    });
    if (!m) throw new NotFoundException("Membership not found.");
    if (m.role === "owner") {
      throw new BadRequestException("Owner cannot leave; delete the room or transfer ownership (not implemented).");
    }

    await this.members.remove(m);
    this.realtime.evictUserFromRoom(args.roomId, args.userId);
    return { ok: true as const };
  }

  async deleteRoom(args: { userId: string; roomId: string }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "collaboration_write" });

    const room = await this.rooms.findOne({ where: { id: args.roomId }, relations: { owner: true } });
    if (!room || room.deletedAt) throw new NotFoundException("Room not found.");
    if (room.owner.id !== args.userId) throw new ForbiddenException("Only the owner can delete this room.");

    await this.rooms.softRemove(room);
    this.realtime.evictRoom(args.roomId);
    return { ok: true as const };
  }
}
