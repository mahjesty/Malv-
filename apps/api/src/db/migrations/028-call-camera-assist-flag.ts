import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Milestone 2 — 1:1 video camera assist consent flag.
 */
export class CallCameraAssistFlag0281775200000000 implements MigrationInterface {
  name = "CallCameraAssistFlag0281775200000000";

  private async currentDb(queryRunner: QueryRunner): Promise<string> {
    const rows = await queryRunner.query(`SELECT DATABASE() AS db`);
    const db = rows[0]?.db as string | undefined;
    if (!db) throw new Error("CallCameraAssistFlag028: no database selected");
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
    if (!(await this.columnExists(queryRunner, db, "call_sessions", "camera_assist_enabled"))) {
      await queryRunner.query(`ALTER TABLE call_sessions ADD COLUMN camera_assist_enabled BOOLEAN NOT NULL DEFAULT FALSE`);
    }
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    /* Non-destructive */
  }
}
