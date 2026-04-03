import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Voice call boxed layer: flow mode (onboarding / consent / active / paused) and
 * per-session transcript persistence opt-in after spoken consent.
 */
export class VoiceFlowBoxed0231774900000000 implements MigrationInterface {
  name = "VoiceFlowBoxed0231774900000000";

  private async currentDb(queryRunner: QueryRunner): Promise<string> {
    const rows = await queryRunner.query(`SELECT DATABASE() AS db`);
    const db = rows[0]?.db as string | undefined;
    if (!db) {
      throw new Error("VoiceFlowBoxed023: no database selected");
    }
    return db;
  }

  private async columnExists(queryRunner: QueryRunner, db: string, table: string, column: string): Promise<boolean> {
    const r = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [db, table, column]
    );
    return Number(r[0]?.c) > 0;
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    const db = await this.currentDb(queryRunner);
    const table = "call_sessions";

    if (!(await this.columnExists(queryRunner, db, table, "voice_flow_mode"))) {
      await queryRunner.query(
        `ALTER TABLE call_sessions ADD COLUMN voice_flow_mode VARCHAR(32) NOT NULL DEFAULT 'active'`
      );
    }
    if (!(await this.columnExists(queryRunner, db, table, "call_transcript_enabled"))) {
      await queryRunner.query(
        `ALTER TABLE call_sessions ADD COLUMN call_transcript_enabled TINYINT(1) NOT NULL DEFAULT 0`
      );
    }
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    /* Non-destructive */
  }
}
