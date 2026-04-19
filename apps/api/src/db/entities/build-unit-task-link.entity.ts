import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * Audit link between a Build Unit and the Task created from it.
 * Created when a user clicks "Send to MALV" from Explore.
 * Enables lineage tracking and "usesCount" incrementing without coupling unit to task directly.
 */
@Entity({ name: "build_unit_task_links" })
export class BuildUnitTaskLinkEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "varchar", length: 36, name: "build_unit_id" })
  buildUnitId!: string;

  @Index()
  @Column({ type: "varchar", length: 36, name: "task_id" })
  taskId!: string;

  @Index()
  @Column({ type: "varchar", length: 36, name: "user_id" })
  userId!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
