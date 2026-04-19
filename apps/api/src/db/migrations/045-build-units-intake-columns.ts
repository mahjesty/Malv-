import { MigrationInterface, QueryRunner } from "typeorm";

/** Optional catalog fields populated when a unit is published from an audited intake (future). */
export class BuildUnitsIntakeColumns1745000000001 implements MigrationInterface {
  name = "BuildUnitsIntakeColumns1745000000001";

  async up(queryRunner: QueryRunner): Promise<void> {
    const colRows: { COLUMN_NAME: string }[] = await queryRunner.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'build_units'
    `);
    const cols = new Set(colRows.map((r) => r.COLUMN_NAME));

    if (!cols.has("intake_preview_state")) {
      await queryRunner.query(`
        ALTER TABLE build_units
          ADD COLUMN intake_preview_state VARCHAR(20) NULL AFTER execution_profile_json
      `);
    }
    if (!cols.has("intake_preview_unavailable_reason")) {
      await queryRunner.query(`
        ALTER TABLE build_units ADD COLUMN intake_preview_unavailable_reason TEXT NULL
      `);
    }
    if (!cols.has("intake_audit_decision")) {
      await queryRunner.query(`
        ALTER TABLE build_units ADD COLUMN intake_audit_decision VARCHAR(32) NULL
      `);
    }
    if (!cols.has("intake_detection_json")) {
      await queryRunner.query(`
        ALTER TABLE build_units ADD COLUMN intake_detection_json JSON NULL
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const colRows: { COLUMN_NAME: string }[] = await queryRunner.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'build_units'
    `);
    const cols = new Set(colRows.map((r) => r.COLUMN_NAME));
    for (const name of [
      "intake_detection_json",
      "intake_audit_decision",
      "intake_preview_unavailable_reason",
      "intake_preview_state"
    ]) {
      if (cols.has(name)) {
        await queryRunner.query(`ALTER TABLE build_units DROP COLUMN \`${name}\``);
      }
    }
  }
}
