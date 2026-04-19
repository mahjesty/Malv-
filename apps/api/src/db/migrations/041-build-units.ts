import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Creates the build_units and build_unit_task_links tables.
 * All CREATE TABLE calls are idempotent (IF NOT EXISTS).
 * build_units holds the full Build Unit catalog — system and user-owned units, forks.
 * build_unit_task_links audits the Explore → Send to MALV → Task lineage.
 */
export class BuildUnits1743811200000 implements MigrationInterface {
  name = "BuildUnits1743811200000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS build_units (
        id                    VARCHAR(36)   NOT NULL PRIMARY KEY,
        slug                  VARCHAR(120)  NOT NULL,
        title                 VARCHAR(220)  NOT NULL,
        description           TEXT          NULL,
        type                  VARCHAR(30)   NOT NULL,
        category              VARCHAR(60)   NOT NULL,
        tags                  JSON          NULL,
        prompt                TEXT          NULL,
        code_snippet          TEXT          NULL,
        preview_image_url     VARCHAR(500)  NULL,
        author_user_id        VARCHAR(36)   NULL,
        author_label          VARCHAR(120)  NULL,
        visibility            VARCHAR(20)   NOT NULL DEFAULT 'public',
        source_kind           VARCHAR(20)   NOT NULL DEFAULT 'user',
        original_build_unit_id VARCHAR(36)  NULL,
        forkable              TINYINT(1)    NOT NULL DEFAULT 1,
        downloadable          TINYINT(1)    NOT NULL DEFAULT 1,
        verified              TINYINT(1)    NOT NULL DEFAULT 0,
        trending              TINYINT(1)    NOT NULL DEFAULT 0,
        recommended           TINYINT(1)    NOT NULL DEFAULT 0,
        is_new                TINYINT(1)    NOT NULL DEFAULT 0,
        accent                VARCHAR(80)   NULL,
        uses_count            INT           NOT NULL DEFAULT 0,
        forks_count           INT           NOT NULL DEFAULT 0,
        downloads_count       INT           NOT NULL DEFAULT 0,
        metadata_json         JSON          NULL,
        created_at            DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at            DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        archived_at           DATETIME      NULL,
        UNIQUE KEY uq_build_units_slug (slug),
        INDEX ix_build_units_type           (type),
        INDEX ix_build_units_category       (category),
        INDEX ix_build_units_visibility     (visibility),
        INDEX ix_build_units_source_kind    (source_kind),
        INDEX ix_build_units_author_user_id (author_user_id),
        INDEX ix_build_units_original_id    (original_build_unit_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS build_unit_task_links (
        id             VARCHAR(36)   NOT NULL PRIMARY KEY,
        build_unit_id  VARCHAR(36)   NOT NULL,
        task_id        VARCHAR(36)   NOT NULL,
        user_id        VARCHAR(36)   NOT NULL,
        created_at     DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX ix_butl_build_unit_id (build_unit_id),
        INDEX ix_butl_task_id       (task_id),
        INDEX ix_butl_user_id       (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS build_unit_task_links`);
    await queryRunner.query(`DROP TABLE IF EXISTS build_units`);
  }
}
