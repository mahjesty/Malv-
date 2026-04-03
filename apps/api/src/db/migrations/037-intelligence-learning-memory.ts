import type { MigrationInterface, QueryRunner } from "typeorm";

export class IntelligenceLearningMemory0371779000000000 implements MigrationInterface {
  name = "IntelligenceLearningMemory0371779000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS intelligence_learning_memory (
        id CHAR(36) NOT NULL,
        pattern_key VARCHAR(128) NOT NULL,
        category VARCHAR(64) NOT NULL,
        issue_code VARCHAR(64) NULL,
        fix_strategy TEXT NOT NULL,
        outcome VARCHAR(16) NOT NULL,
        source_change_request_id CHAR(36) NULL,
        metadata_json JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY ix_intel_learn_pattern (pattern_key),
        KEY ix_intel_learn_category (category),
        KEY ix_intel_learn_req (source_change_request_id),
        CONSTRAINT fk_intel_learn_change_req FOREIGN KEY (source_change_request_id) REFERENCES change_requests(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS intelligence_learning_memory;`);
  }
}
