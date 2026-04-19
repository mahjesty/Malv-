import { MigrationInterface, QueryRunner } from "typeorm";

/** Human-readable one-line outcome for APIs and UI (not a legal verdict). */
export class SourceIntakeAuditSummary1743200000000 implements MigrationInterface {
  name = "SourceIntakeAuditSummary1743200000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE source_intake_sessions
      ADD COLUMN audit_summary TEXT NULL AFTER audit_json
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE source_intake_sessions DROP COLUMN audit_summary
    `);
  }
}
