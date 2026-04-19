import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Persisted catalog grid snapshot (files.id), separate from optional HTML live preview artifact.
 */
export class BuildUnitsPreviewSnapshot1743889000000 implements MigrationInterface {
  name = "BuildUnitsPreviewSnapshot1743889000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    const colRows: { COLUMN_NAME: string }[] = await queryRunner.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'build_units'
    `);
    const cols = new Set(colRows.map((r) => r.COLUMN_NAME));

    if (!cols.has("preview_snapshot_id")) {
      await queryRunner.query(`ALTER TABLE build_units ADD COLUMN preview_snapshot_id VARCHAR(36) NULL`);
    }

    const idxRows: { INDEX_NAME: string }[] = await queryRunner.query(`
      SELECT DISTINCT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'build_units'
    `);
    const indexes = new Set(idxRows.map((r) => r.INDEX_NAME));

    if (!indexes.has("ix_build_units_preview_snapshot")) {
      await queryRunner.query(`ALTER TABLE build_units ADD INDEX ix_build_units_preview_snapshot (preview_snapshot_id)`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const idxRows: { INDEX_NAME: string }[] = await queryRunner.query(`
      SELECT DISTINCT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'build_units'
    `);
    const indexes = new Set(idxRows.map((r) => r.INDEX_NAME));
    if (indexes.has("ix_build_units_preview_snapshot")) {
      await queryRunner.query(`ALTER TABLE build_units DROP INDEX ix_build_units_preview_snapshot`);
    }

    const colRows: { COLUMN_NAME: string }[] = await queryRunner.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'build_units'
    `);
    const cols = new Set(colRows.map((r) => r.COLUMN_NAME));
    if (cols.has("preview_snapshot_id")) {
      await queryRunner.query(`ALTER TABLE build_units DROP COLUMN preview_snapshot_id`);
    }
  }
}
