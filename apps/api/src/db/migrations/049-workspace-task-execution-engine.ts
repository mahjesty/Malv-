import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Lease + outcome columns for workspace task execution engine (multi-worker safe claims).
 */
export class WorkspaceTaskExecutionEngine04920260413000000 implements MigrationInterface {
  name = "WorkspaceTaskExecutionEngine04920260413000000";

  private async addColumnIfMissing(
    qr: QueryRunner,
    table: string,
    column: string,
    definition: string,
    after: string
  ): Promise<void> {
    const [rows]: any = await qr.query(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    if (!rows?.length) {
      await qr.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition} AFTER ${after}`);
    }
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    const t = "workspace_tasks";
    await this.addColumnIfMissing(queryRunner, t, "execution_lease_owner", "VARCHAR(160) NULL", "metadata");
    await this.addColumnIfMissing(queryRunner, t, "execution_lease_expires_at", "DATETIME NULL", "execution_lease_owner");
    await this.addColumnIfMissing(queryRunner, t, "execution_last_attempt_at", "DATETIME NULL", "execution_lease_expires_at");
    await this.addColumnIfMissing(queryRunner, t, "execution_last_outcome", "VARCHAR(40) NULL", "execution_last_attempt_at");
    await this.addColumnIfMissing(queryRunner, t, "execution_failure_code", "VARCHAR(80) NULL", "execution_last_outcome");
    await this.addColumnIfMissing(queryRunner, t, "execution_failure_detail", "TEXT NULL", "execution_failure_code");
  }

  private async dropColumnIfExists(qr: QueryRunner, table: string, column: string): Promise<void> {
    const [rows]: any = await qr.query(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    if (rows?.length) {
      await qr.query(`ALTER TABLE ${table} DROP COLUMN ${column}`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const t = "workspace_tasks";
    for (const col of [
      "execution_failure_detail",
      "execution_failure_code",
      "execution_last_outcome",
      "execution_last_attempt_at",
      "execution_lease_expires_at",
      "execution_lease_owner"
    ]) {
      await this.dropColumnIfExists(queryRunner, t, col);
    }
  }
}
