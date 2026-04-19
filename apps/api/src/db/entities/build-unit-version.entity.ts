import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * Point-in-time snapshot of a Build Unit, created immediately before each PATCH update.
 */
@Entity({ name: "build_unit_versions" })
export class BuildUnitVersionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "varchar", length: 36, name: "build_unit_id" })
  buildUnitId!: string;

  @Index()
  @Column({ type: "int", name: "version_number" })
  versionNumber!: number;

  @Column({ type: "json", name: "snapshot_json" })
  snapshotJson!: Record<string, unknown>;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
