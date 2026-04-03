import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import type { InferenceBackendType, InferenceFallbackPolicy } from "../../inference/inference-config.types";

@Entity({ name: "inference_backend_settings" })
export class InferenceBackendSettingsEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /**
   * When false, env-backed config is used.
   * When true, this row is treated as the DB override source of truth (if valid).
   */
  @Column({ type: "boolean", name: "enabled", default: false })
  enabled!: boolean;

  @Column({ type: "varchar", length: 64, name: "backend_type" })
  backendType!: InferenceBackendType;

  @Column({ type: "text", name: "base_url", nullable: true })
  baseUrl!: string | null;

  /**
   * Secret token for openai_compatible backends.
   * Never return this field from admin endpoints unredacted.
   */
  @Column({ type: "text", name: "api_key", nullable: true })
  apiKey!: string | null;

  @Column({ type: "varchar", length: 512, name: "model", nullable: true })
  model!: string | null;

  @Column({ type: "int", name: "timeout_ms", nullable: true })
  timeoutMs!: number | null;

  @Column({ type: "boolean", name: "fallback_enabled", default: true })
  fallbackEnabled!: boolean;

  @Column({ type: "varchar", length: 64, name: "fallback_backend", nullable: true })
  fallbackBackend!: InferenceBackendType | null;

  @Column({ type: "varchar", length: 32, name: "fallback_policy", default: "allow_on_error" })
  fallbackPolicy!: InferenceFallbackPolicy;

  @Column({ type: "char", length: 36, name: "last_updated_by_user_id", nullable: true })
  lastUpdatedByUserId!: string | null;

  @CreateDateColumn({ name: "created_at", type: "datetime" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "datetime" })
  updatedAt!: Date;
}

