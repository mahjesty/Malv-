import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { UserEntity } from "./user.entity";

@Entity({ name: "rate_limit_events" })
export class RateLimitEventEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "user_id" })
  user?: UserEntity | null;

  @Index()
  @Column({ type: "varchar", length: 120, name: "route_key" })
  routeKey!: string;

  @Column({ type: "varchar", length: 200, name: "limit_key" })
  limitKey!: string;

  @Column({ type: "int", name: "hit_count", default: 1 })
  hitCount!: number;

  @Column({ type: "int", name: "window_seconds" })
  windowSeconds!: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
