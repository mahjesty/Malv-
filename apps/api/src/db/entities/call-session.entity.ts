import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, ManyToOne, JoinColumn, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { UserEntity } from "./user.entity";
import type {
  CallConnectionState,
  CallOperatorActivityStatus,
  CallParticipationScope,
  CallTranscriptStreamingStatus,
  CallVoiceState,
  VoiceFlowMode
} from "../../calls/call-runtime.types";

export type CallSessionKind = "voice" | "video";
export type CallSessionStatus = "active" | "ended";
export type { CallParticipationScope } from "../../calls/call-runtime.types";

@Entity({ name: "call_sessions" })
export class CallSessionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Index()
  @Column({ type: "varchar", length: 20, name: "kind" })
  kind!: CallSessionKind;

  @Index()
  @Column({ type: "varchar", length: 20, name: "status", default: "active" })
  status!: CallSessionStatus;

  @Column({ type: "datetime", name: "started_at" })
  startedAt!: Date;

  @Column({ type: "datetime", name: "ended_at", nullable: true })
  endedAt?: Date | null;

  @Column({ type: "varchar", length: 20, name: "connection_state", default: "healthy" })
  connectionState!: CallConnectionState;

  @Column({ type: "varchar", length: 20, name: "voice_state", default: "idle" })
  voiceState!: CallVoiceState;

  @Column({ type: "boolean", name: "mic_muted", default: false })
  micMuted!: boolean;

  @Column({ type: "boolean", name: "malv_paused", default: false })
  malvPaused!: boolean;

  @Column({ type: "datetime", name: "last_heartbeat_at", nullable: true })
  lastHeartbeatAt?: Date | null;

  @Column({ type: "varchar", length: 20, name: "transcript_streaming_status", default: "idle" })
  transcriptStreamingStatus!: CallTranscriptStreamingStatus;

  @Column({ type: "varchar", length: 32, name: "voice_flow_mode", default: "active" })
  voiceFlowMode!: VoiceFlowMode;

  @Column({ type: "boolean", name: "call_transcript_enabled", default: false })
  callTranscriptEnabled!: boolean;

  @Column({ type: "boolean", name: "camera_assist_enabled", default: false })
  cameraAssistEnabled!: boolean;

  @Column({ type: "varchar", length: 30, name: "operator_activity_status", default: "idle" })
  operatorActivityStatus!: CallOperatorActivityStatus;

  @Column({ type: "int", name: "reconnect_count", default: 0 })
  reconnectCount!: number;

  /** Optional workspace conversation for chat ↔ call continuity (FK enforced in DB). */
  @Index()
  @Column({ type: "varchar", length: 36, name: "conversation_id", nullable: true })
  conversationId?: string | null;

  /** Post-call recap (summary, action items, timestamps); structure is app-defined JSON. */
  @Column({ type: "json", name: "recap_json", nullable: true })
  recapJson?: Record<string, unknown> | null;

  @Column({ type: "varchar", length: 20, name: "participation_scope", default: "direct" })
  participationScope!: CallParticipationScope;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}

