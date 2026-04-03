import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Idempotent repair: ensures `users` has OAuth provider columns and nullable password_hash.
 *
 * Root issue: `UserEntity` maps oauth_* columns; any query joining `users` (e.g. AiJobEntity with
 * relations: ["user"] in BackgroundJobRunnerService) selects these columns. If migration 015 was
 * never applied locally, MySQL raises "Unknown column ... oauth_google_sub".
 *
 * Safe to run after 015 (no-op if already applied) or on DBs that skipped 015.
 */
export class EnsureUsersOauthColumns0171774500000000 implements MigrationInterface {
  name = "EnsureUsersOauthColumns0171774500000000";

  private async currentDb(queryRunner: QueryRunner): Promise<string> {
    const rows = await queryRunner.query(`SELECT DATABASE() AS db`);
    const db = rows[0]?.db as string | undefined;
    if (!db) {
      throw new Error("EnsureUsersOauthColumns017: no database selected");
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

    const pwd = await queryRunner.query(
      `SELECT IS_NULLABLE AS n FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'password_hash'`,
      [db]
    );
    if (pwd[0]?.n === "NO") {
      await queryRunner.query(`ALTER TABLE users MODIFY password_hash VARCHAR(255) NULL`);
    }

    if (!(await this.columnExists(queryRunner, db, "users", "oauth_google_sub"))) {
      await queryRunner.query(`ALTER TABLE users ADD COLUMN oauth_google_sub VARCHAR(255) NULL`);
    }
    if (!(await this.columnExists(queryRunner, db, "users", "oauth_apple_sub"))) {
      await queryRunner.query(`ALTER TABLE users ADD COLUMN oauth_apple_sub VARCHAR(255) NULL`);
    }
    if (!(await this.columnExists(queryRunner, db, "users", "oauth_github_sub"))) {
      await queryRunner.query(`ALTER TABLE users ADD COLUMN oauth_github_sub VARCHAR(255) NULL`);
    }

    if (!(await this.indexExistsOnTable(queryRunner, db, "users", "uq_users_oauth_google_sub"))) {
      await queryRunner.query(`ALTER TABLE users ADD UNIQUE KEY uq_users_oauth_google_sub (oauth_google_sub)`);
    }
    if (!(await this.indexExistsOnTable(queryRunner, db, "users", "uq_users_oauth_apple_sub"))) {
      await queryRunner.query(`ALTER TABLE users ADD UNIQUE KEY uq_users_oauth_apple_sub (oauth_apple_sub)`);
    }
    if (!(await this.indexExistsOnTable(queryRunner, db, "users", "uq_users_oauth_github_sub"))) {
      await queryRunner.query(`ALTER TABLE users ADD UNIQUE KEY uq_users_oauth_github_sub (oauth_github_sub)`);
    }
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Non-destructive default: oauth columns are required by UserEntity / auth flows.
  }
}
