import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Preview kind, stored file references for preview/source assets, optional external source URL.
 *
 * Idempotent: if a prior run failed after implicit DDL commits, columns may already exist.
 */
export class BuildUnitsPreviewUploads1743888000000 implements MigrationInterface {
  name = "BuildUnitsPreviewUploads1743888000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    const colRows: { COLUMN_NAME: string }[] = await queryRunner.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'build_units'
    `);
    const cols = new Set(colRows.map((r) => r.COLUMN_NAME));

    if (!cols.has("preview_kind")) {
      await queryRunner.query(
        `ALTER TABLE build_units ADD COLUMN preview_kind VARCHAR(20) NOT NULL DEFAULT 'none'`
      );
    }
    if (!cols.has("preview_file_id")) {
      await queryRunner.query(`ALTER TABLE build_units ADD COLUMN preview_file_id VARCHAR(36) NULL`);
    }
    if (!cols.has("source_file_id")) {
      await queryRunner.query(`ALTER TABLE build_units ADD COLUMN source_file_id VARCHAR(36) NULL`);
    }
    if (!cols.has("source_file_name")) {
      await queryRunner.query(`ALTER TABLE build_units ADD COLUMN source_file_name VARCHAR(255) NULL`);
    }
    if (!cols.has("source_file_mime")) {
      await queryRunner.query(`ALTER TABLE build_units ADD COLUMN source_file_mime VARCHAR(100) NULL`);
    }
    if (!cols.has("source_file_url")) {
      await queryRunner.query(`ALTER TABLE build_units ADD COLUMN source_file_url VARCHAR(512) NULL`);
    }

    const idxRows: { INDEX_NAME: string }[] = await queryRunner.query(`
      SELECT DISTINCT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'build_units'
    `);
    const indexes = new Set(idxRows.map((r) => r.INDEX_NAME));

    if (!indexes.has("ix_build_units_preview_file")) {
      await queryRunner.query(
        `ALTER TABLE build_units ADD INDEX ix_build_units_preview_file (preview_file_id)`
      );
    }
    if (!indexes.has("ix_build_units_source_file")) {
      await queryRunner.query(
        `ALTER TABLE build_units ADD INDEX ix_build_units_source_file (source_file_id)`
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const idxRows: { INDEX_NAME: string }[] = await queryRunner.query(`
      SELECT DISTINCT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'build_units'
    `);
    const indexes = new Set(idxRows.map((r) => r.INDEX_NAME));

    if (indexes.has("ix_build_units_preview_file")) {
      await queryRunner.query(`ALTER TABLE build_units DROP INDEX ix_build_units_preview_file`);
    }
    if (indexes.has("ix_build_units_source_file")) {
      await queryRunner.query(`ALTER TABLE build_units DROP INDEX ix_build_units_source_file`);
    }

    const colRows: { COLUMN_NAME: string }[] = await queryRunner.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'build_units'
    `);
    const cols = new Set(colRows.map((r) => r.COLUMN_NAME));

    const dropOrder = [
      "source_file_url",
      "source_file_mime",
      "source_file_name",
      "source_file_id",
      "preview_file_id",
      "preview_kind"
    ];
    for (const name of dropOrder) {
      if (cols.has(name)) {
        await queryRunner.query(`ALTER TABLE build_units DROP COLUMN \`${name}\``);
      }
    }
  }
}
