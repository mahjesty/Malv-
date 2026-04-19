import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from "typeorm";
import { UserEntity } from "./user.entity";

@Entity({ name: "malv_user_continuity_state" })
export class MalvUserContinuityStateEntity {
  @PrimaryColumn({ type: "char", length: 36, name: "id" })
  id!: string;

  @Index()
  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Index()
  @Column({ type: "varchar", length: 128, name: "session_key" })
  sessionKey!: string;

  @Column({ type: "int", name: "schema_version", default: 1 })
  schemaVersion!: number;

  @Column({ type: "json", name: "payload_json" })
  payloadJson!: Record<string, unknown>;

  @Index()
  @Column({ type: "datetime", precision: 3, name: "expires_at" })
  expiresAt!: Date;

  @CreateDateColumn({ name: "created_at", precision: 3 })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", precision: 3 })
  updatedAt!: Date;
}
