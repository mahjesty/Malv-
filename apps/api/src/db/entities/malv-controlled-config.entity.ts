import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "malv_controlled_config" })
export class MalvControlledConfigEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 120, name: "config_key" })
  configKey!: string;

  @Column({ type: "json", name: "value_json" })
  valueJson!: Record<string, unknown>;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
