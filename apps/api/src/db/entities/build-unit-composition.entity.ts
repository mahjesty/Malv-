import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * User-defined grouping of multiple Build Units (saved system / bundle).
 */
@Entity({ name: "build_unit_compositions" })
export class BuildUnitCompositionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 220, name: "name" })
  name!: string;

  @Index()
  @Column({ type: "varchar", length: 36, name: "user_id" })
  userId!: string;

  /** Ordered list of Build Unit UUIDs the user can access. */
  @Column({ type: "json", name: "unit_ids" })
  unitIds!: string[];

  @Column({ type: "json", name: "metadata_json", nullable: true })
  metadataJson!: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
