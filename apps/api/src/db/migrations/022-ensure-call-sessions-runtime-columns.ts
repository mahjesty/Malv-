import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Idempotent backfill for `call_sessions` runtime columns from migration 021.
 * Some MySQL/MariaDB versions reject `ADD COLUMN IF NOT EXISTS` in a multi-add ALTER,
 * so 021 may have failed while leaving an older schema — inserts then 500 at POST /v1/calls.
 */
export class EnsureCallSessionsRuntimeColumns0221774800000000 implements MigrationInterface {
  name = "EnsureCallSessionsRuntimeColumns0221774800000000";

  private async currentDb(queryRunner: QueryRunner): Promise<string> {
    const rows = await queryRunner.query(`SELECT DATABASE() AS db`);
    const db = rows[0]?.db as string | undefined;
    if (!db) {
      throw new Error("EnsureCallSessionsRuntimeColumns022: no database selected");
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

    if (!(await this.columnExists(queryRunner, db, table, "connection_state"))) {
      await queryRunner.query(`ALTER TABLE call_sessions ADD COLUMN connection_state VARCHAR(20) NOT NULL DEFAULT 'healthy'`);
    }
    if (!(await this.columnExists(queryRunner, db, table, "voice_state"))) {
      await queryRunner.query(`ALTER TABLE call_sessions ADD COLUMN voice_state VARCHAR(20) NOT NULL DEFAULT 'idle'`);
    }
    if (!(await this.columnExists(queryRunner, db, table, "mic_muted"))) {
      await queryRunner.query(`ALTER TABLE call_sessions ADD COLUMN mic_muted TINYINT(1) NOT NULL DEFAULT 0`);
    }
    if (!(await this.columnExists(queryRunner, db, table, "malv_paused"))) {
      await queryRunner.query(`ALTER TABLE call_sessions ADD COLUMN malv_paused TINYINT(1) NOT NULL DEFAULT 0`);
    }
    if (!(await this.columnExists(queryRunner, db, table, "last_heartbeat_at"))) {
      await queryRunner.query(`ALTER TABLE call_sessions ADD COLUMN last_heartbeat_at DATETIME NULL`);
    }
    if (!(await this.columnExists(queryRunner, db, table, "transcript_streaming_status"))) {
      await queryRunner.query(
        `ALTER TABLE call_sessions ADD COLUMN transcript_streaming_status VARCHAR(20) NOT NULL DEFAULT 'idle'`
      );
    }
    if (!(await this.columnExists(queryRunner, db, table, "operator_activity_status"))) {
      await queryRunner.query(
        `ALTER TABLE call_sessions ADD COLUMN operator_activity_status VARCHAR(30) NOT NULL DEFAULT 'idle'`
      );
    }
    if (!(await this.columnExists(queryRunner, db, table, "reconnect_count"))) {
      await queryRunner.query(`ALTER TABLE call_sessions ADD COLUMN reconnect_count INT NOT NULL DEFAULT 0`);
    }

    if (!(await this.indexExistsOnTable(queryRunner, db, table, "ix_call_sessions_last_heartbeat_at"))) {
      await queryRunner.query(`CREATE INDEX ix_call_sessions_last_heartbeat_at ON call_sessions(last_heartbeat_at)`);
    }
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    /* Non-destructive: columns may be required by the app; do not drop. */
  }
}
