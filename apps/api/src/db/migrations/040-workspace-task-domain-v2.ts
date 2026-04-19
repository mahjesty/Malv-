import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Extends workspace_tasks with the full MALV Task domain model.
 * Uses information_schema checks so this is safe to run on any MySQL 8.x.
 */
export class WorkspaceTaskDomainV21743724800000 implements MigrationInterface {
  name = "WorkspaceTaskDomainV21743724800000";

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

  private async addIndexIfMissing(
    qr: QueryRunner,
    table: string,
    indexName: string,
    column: string
  ): Promise<void> {
    const [rows]: any = await qr.query(
      `SELECT 1 FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
      [table, indexName]
    );
    if (!rows?.length) {
      await qr.query(`ALTER TABLE ${table} ADD INDEX ${indexName} (${column})`);
    }
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    const t = "workspace_tasks";

    await this.addColumnIfMissing(queryRunner, t, "priority",            "VARCHAR(30) NOT NULL DEFAULT 'normal'", "status");
    await this.addColumnIfMissing(queryRunner, t, "source_surface",      "VARCHAR(30) NOT NULL DEFAULT 'manual'", "source");
    await this.addColumnIfMissing(queryRunner, t, "source_type",         "VARCHAR(60) NULL",                      "source_surface");
    await this.addColumnIfMissing(queryRunner, t, "source_reference_id", "VARCHAR(36) NULL",                      "source_type");
    await this.addColumnIfMissing(queryRunner, t, "execution_type",      "VARCHAR(30) NOT NULL DEFAULT 'manual'", "source_reference_id");
    await this.addColumnIfMissing(queryRunner, t, "execution_state",     "VARCHAR(30) NOT NULL DEFAULT 'idle'",   "execution_type");
    await this.addColumnIfMissing(queryRunner, t, "due_at",              "DATETIME NULL",                         "execution_state");
    await this.addColumnIfMissing(queryRunner, t, "scheduled_for",       "DATETIME NULL",                         "due_at");
    await this.addColumnIfMissing(queryRunner, t, "reminder_at",         "DATETIME NULL",                         "scheduled_for");
    await this.addColumnIfMissing(queryRunner, t, "requires_approval",   "TINYINT NOT NULL DEFAULT 0",            "reminder_at");
    await this.addColumnIfMissing(queryRunner, t, "risk_level",          "VARCHAR(20) NOT NULL DEFAULT 'low'",    "requires_approval");
    await this.addColumnIfMissing(queryRunner, t, "tags",                "JSON NULL",                             "risk_level");
    await this.addColumnIfMissing(queryRunner, t, "completed_at",        "DATETIME NULL",                         "tags");
    await this.addColumnIfMissing(queryRunner, t, "archived_at",         "DATETIME NULL",                         "completed_at");

    // Backfill source_surface from source for existing rows
    await queryRunner.query(
      `UPDATE ${t} SET source_surface = source WHERE source_surface = 'manual' AND source != 'manual'`
    );

    await this.addIndexIfMissing(queryRunner, t, "ix_workspace_tasks_priority",        "priority");
    await this.addIndexIfMissing(queryRunner, t, "ix_workspace_tasks_source_surface",  "source_surface");
    await this.addIndexIfMissing(queryRunner, t, "ix_workspace_tasks_execution_state", "execution_state");
    await this.addIndexIfMissing(queryRunner, t, "ix_workspace_tasks_due_at",          "due_at");
    await this.addIndexIfMissing(queryRunner, t, "ix_workspace_tasks_scheduled_for",   "scheduled_for");
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Non-destructive rollback policy — columns are left in place.
  }
}
