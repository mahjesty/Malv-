import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Source intake sessions: upload → detection → audit → (optional) preview → publish.
 * Declined intakes never receive build_unit_id.
 */
export class SourceIntakeSessions1745000000000 implements MigrationInterface {
  name = "SourceIntakeSessions1745000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    // files.id is utf8mb4_general_ci (005); this table defaults to unicode_ci for build_units(id).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS source_intake_sessions (
        id                           VARCHAR(36)  NOT NULL PRIMARY KEY,
        user_id                      VARCHAR(36)  NOT NULL,
        status                       VARCHAR(32)  NOT NULL,
        audit_decision               VARCHAR(32)  NOT NULL,
        source_file_id               CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
        detection_json               JSON         NULL,
        audit_json                   JSON         NULL,
        preview_state                VARCHAR(24)  NOT NULL DEFAULT 'not_requested',
        preview_unavailable_reason   TEXT         NULL,
        build_unit_id                VARCHAR(36)  NULL,
        created_at                   DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at                   DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX ix_source_intake_user_id        (user_id),
        INDEX ix_source_intake_status         (status),
        INDEX ix_source_intake_audit_decision (audit_decision),
        INDEX ix_source_intake_source_file    (source_file_id),
        INDEX ix_source_intake_build_unit     (build_unit_id),
        CONSTRAINT fk_source_intake_file
          FOREIGN KEY (source_file_id) REFERENCES files(id) ON DELETE RESTRICT,
        CONSTRAINT fk_source_intake_build_unit
          FOREIGN KEY (build_unit_id) REFERENCES build_units(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS source_intake_sessions`);
  }
}
