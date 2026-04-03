import { MigrationInterface, QueryRunner } from "typeorm";

export class InferenceBackendSettings0201775500000000 implements MigrationInterface {
  name = "InferenceBackendSettings0201775500000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS inference_backend_settings (
        id CHAR(36) NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT FALSE,
        backend_type VARCHAR(64) NOT NULL,
        base_url TEXT NULL,
        api_key TEXT NULL,
        model VARCHAR(512) NULL,
        timeout_ms INT NULL,
        fallback_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        fallback_backend VARCHAR(64) NULL,
        fallback_policy VARCHAR(32) NOT NULL DEFAULT 'allow_on_error',
        last_updated_by_user_id CHAR(36) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS inference_backend_settings;`);
  }
}

