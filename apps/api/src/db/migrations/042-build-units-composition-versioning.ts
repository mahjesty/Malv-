import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Compositions (multi-unit bundles), version history per unit, and execution_profile_json on build_units.
 */
export class BuildUnitsCompositionVersioning1743868800000 implements MigrationInterface {
  name = "BuildUnitsCompositionVersioning1743868800000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS build_unit_compositions (
        id             VARCHAR(36)   NOT NULL PRIMARY KEY,
        name           VARCHAR(220)  NOT NULL,
        user_id        VARCHAR(36)   NOT NULL,
        unit_ids       JSON          NOT NULL,
        metadata_json  JSON          NULL,
        created_at     DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX ix_buc_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS build_unit_versions (
        id              VARCHAR(36)   NOT NULL PRIMARY KEY,
        build_unit_id   VARCHAR(36)   NOT NULL,
        version_number  INT           NOT NULL,
        snapshot_json   JSON          NOT NULL,
        created_at      DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        UNIQUE KEY uq_buv_unit_version (build_unit_id, version_number),
        INDEX ix_buv_build_unit_id (build_unit_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      ALTER TABLE build_units
      ADD COLUMN execution_profile_json JSON NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE build_units DROP COLUMN execution_profile_json`);
    await queryRunner.query(`DROP TABLE IF EXISTS build_unit_versions`);
    await queryRunner.query(`DROP TABLE IF EXISTS build_unit_compositions`);
  }
}
