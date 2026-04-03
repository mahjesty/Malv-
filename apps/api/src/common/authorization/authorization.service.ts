import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { RoomMemberEntity } from "../../db/entities/room-member.entity";
import { CollaborationRoomEntity } from "../../db/entities/collaboration-room.entity";
import { CallSessionEntity } from "../../db/entities/call-session.entity";
import { FileEntity } from "../../db/entities/file.entity";

@Injectable()
export class AuthorizationService {
  constructor(
    @InjectRepository(RoomMemberEntity) private readonly roomMembers: Repository<RoomMemberEntity>,
    @InjectRepository(CollaborationRoomEntity) private readonly rooms: Repository<CollaborationRoomEntity>,
    @InjectRepository(CallSessionEntity) private readonly calls: Repository<CallSessionEntity>,
    @InjectRepository(FileEntity) private readonly files: Repository<FileEntity>
  ) {}

  async assertRoomMemberOrThrow(args: { userId: string; roomId: string }) {
    const membership = await this.roomMembers.findOne({
      where: { room: { id: args.roomId }, user: { id: args.userId } },
      relations: { room: true }
    });
    if (!membership?.room || membership.room.deletedAt) {
      throw new NotFoundException("Room not found.");
    }
    return membership;
  }

  async assertRoomOwnerOrThrow(args: { userId: string; roomId: string }) {
    const room = await this.rooms.findOne({ where: { id: args.roomId }, relations: { owner: true } });
    if (!room || room.deletedAt) throw new NotFoundException("Room not found.");
    if (room.owner.id !== args.userId) throw new UnauthorizedException("Room ownership required.");
    return room;
  }

  async assertCallOwnerOrThrow(args: { userId: string; callSessionId: string }) {
    const call = await this.calls.findOne({ where: { id: args.callSessionId, user: { id: args.userId } } });
    if (!call) throw new UnauthorizedException("Call session not found or not owned by user.");
    return call;
  }

  async assertFileReadableOrThrow(args: { userId: string; fileId: string }) {
    const file = await this.files.findOne({
      where: { id: args.fileId },
      relations: ["workspace", "collaborationRoom", "user"]
    });
    if (!file) throw new NotFoundException("File not found.");
    if (file.user?.id === args.userId) return file;
    if (!file.collaborationRoom?.id) throw new NotFoundException("File not found.");
    await this.assertRoomMemberOrThrow({ userId: args.userId, roomId: file.collaborationRoom.id });
    return file;
  }

  async assertFileOwnerOrThrow(args: { userId: string; fileId: string }) {
    const file = await this.files.findOne({ where: { id: args.fileId }, relations: ["user"] });
    if (!file || file.user?.id !== args.userId) throw new NotFoundException("File not found.");
    return file;
  }
}
