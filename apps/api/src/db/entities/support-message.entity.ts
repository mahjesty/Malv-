import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";
import { UserEntity } from "./user.entity";
import { SupportTicketEntity } from "./support-ticket.entity";

export type SupportMessageFromRole = "user" | "support" | "admin" | "system";

@Entity({ name: "support_messages" })
export class SupportMessageEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => SupportTicketEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "ticket_id" })
  ticket!: SupportTicketEntity;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Index()
  @Column({ type: "varchar", length: 20, name: "from_role" })
  fromRole!: SupportMessageFromRole;

  @Column({ type: "text", name: "content" })
  content!: string;

  @Column({ type: "boolean", name: "internal_note", default: false })
  internalNote!: boolean;

  @Column({ type: "json", name: "metadata", nullable: true })
  metadata?: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}
