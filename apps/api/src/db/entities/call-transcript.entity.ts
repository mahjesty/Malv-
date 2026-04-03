import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { UserEntity } from "./user.entity";
import { CallSessionEntity } from "./call-session.entity";

export type TranscriptSpeakerRole = "user" | "malv" | "support" | "system";

@Entity({ name: "call_transcripts" })
export class CallTranscriptEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => CallSessionEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "call_session_id" })
  callSession!: CallSessionEntity;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Index()
  @Column({ type: "varchar", length: 20, name: "speaker_role" })
  speakerRole!: TranscriptSpeakerRole;

  @Column({ type: "text", name: "content" })
  content!: string;

  @Column({ type: "int", name: "start_time_ms", nullable: true })
  startTimeMs?: number | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}

