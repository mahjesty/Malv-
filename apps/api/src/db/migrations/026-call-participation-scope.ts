import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Blueprint: group calls restrict avatar switching — persisted scope on the call session.
 */
export class CallParticipationScope0261775000000000 implements MigrationInterface {
  name = "CallParticipationScope0261775000000000";

  private async currentDb(queryRunner: QueryRunner): Promise<string> {
    const rows = await queryRunner.query(`SELECT DATABASE() AS db`);
    const db = rows[0]?.db as string | undefined;
    if (!db) {
      throw new Error("CallParticipationScope026: no database selected");
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

    if (!(await this.columnExists(queryRunner, db, table, "participation_scope"))) {
      await queryRunner.query(
        `ALTER TABLE call_sessions ADD COLUMN participation_scope VARCHAR(20) NOT NULL DEFAULT 'direct'`
      );
    }
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    /* Non-destructive: column may be required by the app. */
  }
}
