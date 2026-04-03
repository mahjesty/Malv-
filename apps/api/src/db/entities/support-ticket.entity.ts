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
import { SupportCategoryEntity } from "./support-category.entity";

export type SupportTicketPriority = "low" | "normal" | "high";
export type SupportTicketStatus = "open" | "closed";

@Entity({ name: "support_tickets" })
export class SupportTicketEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @ManyToOne(() => SupportCategoryEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "category_id" })
  @Index()
  category!: SupportCategoryEntity;

  @Column({ type: "varchar", length: 20, name: "priority", default: "normal" })
  priority!: SupportTicketPriority;

  @Index()
  @Column({ type: "varchar", length: 20, name: "status", default: "open" })
  status!: SupportTicketStatus;

  @Column({ type: "varchar", length: 220, name: "subject" })
  subject!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @Column({ type: "datetime", name: "closed_at", nullable: true })
  closedAt?: Date | null;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}

