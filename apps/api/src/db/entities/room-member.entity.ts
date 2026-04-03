import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, Unique } from "typeorm";
import { UserEntity } from "./user.entity";
import { CollaborationRoomEntity } from "./collaboration-room.entity";

export type RoomMemberRole = "owner" | "member";

@Entity({ name: "room_members" })
@Unique("uq_room_members_room_user", ["room", "user"])
export class RoomMemberEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @ManyToOne(() => CollaborationRoomEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "room_id" })
  room!: CollaborationRoomEntity;

  @Index()
  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Column({ type: "varchar", length: 20, name: "role" })
  role!: RoomMemberRole;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
