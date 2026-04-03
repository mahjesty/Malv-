import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 2 — call continuity: optional link to workspace conversation + post-call recap JSON.
 */
export class CallSessionConversationRecap0241774900000000 implements MigrationInterface {
  name = "CallSessionConversationRecap0241774900000000";

  private async currentDb(queryRunner: QueryRunner): Promise<string> {
    const rows = await queryRunner.query(`SELECT DATABASE() AS db`);
    const db = rows[0]?.db as string | undefined;
    if (!db) {
      throw new Error("CallSessionConversationRecap024: no database selected");
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

  private async fkExists(queryRunner: QueryRunner, db: string, table: string, constraintName: string): Promise<boolean> {
    const r = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
      [db, table, constraintName]
    );
    return Number(r[0]?.c) > 0;
  }

  private async indexExistsOnTable(queryRunner: QueryRunner, db: string, table: string, indexName: string): Promise<boolean> {
    const r = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
      [db, table, indexName]
    );
    return Number(r[0]?.c) > 0;
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    const db = await this.currentDb(queryRunner);
    const table = "call_sessions";

    if (!(await this.columnExists(queryRunner, db, table, "conversation_id"))) {
      await queryRunner.query(`ALTER TABLE call_sessions ADD COLUMN conversation_id CHAR(36) NULL`);
    }
    if (!(await this.columnExists(queryRunner, db, table, "recap_json"))) {
      await queryRunner.query(`ALTER TABLE call_sessions ADD COLUMN recap_json JSON NULL`);
    }

    const fkName = "fk_call_sessions_conversation_id";
    if (!(await this.fkExists(queryRunner, db, table, fkName))) {
      await queryRunner.query(
        `ALTER TABLE call_sessions ADD CONSTRAINT ${fkName} FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL`
      );
    }

    if (!(await this.indexExistsOnTable(queryRunner, db, table, "ix_call_sessions_conversation_id"))) {
      await queryRunner.query(`CREATE INDEX ix_call_sessions_conversation_id ON call_sessions(conversation_id)`);
    }
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    /* Non-destructive: FK/columns may be required by the app. */
  }
}
