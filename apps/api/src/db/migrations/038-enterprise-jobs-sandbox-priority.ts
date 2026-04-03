import type { MigrationInterface, QueryRunner } from "typeorm";

export class EnterpriseJobsSandboxPriority0381780000000000 implements MigrationInterface {
  name = "EnterpriseJobsSandboxPriority0381780000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ai_jobs
        ADD COLUMN attempt_count INT NOT NULL DEFAULT 0 AFTER progress,
        ADD COLUMN max_attempts INT NOT NULL DEFAULT 3 AFTER attempt_count,
        ADD COLUMN next_retry_after DATETIME(3) NULL AFTER max_attempts;
    `);
    await queryRunner.query(`CREATE INDEX ix_ai_jobs_next_retry ON ai_jobs (status, next_retry_after);`);
    await queryRunner.query(`
      ALTER TABLE sandbox_runs
        ADD COLUMN run_priority INT NOT NULL DEFAULT 50 AFTER status;
    `);
    await queryRunner.query(`CREATE INDEX ix_sandbox_runs_staged_priority ON sandbox_runs (status, run_priority, created_at);`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX ix_sandbox_runs_staged_priority ON sandbox_runs;`);
    await queryRunner.query(`ALTER TABLE sandbox_runs DROP COLUMN run_priority;`);
    await queryRunner.query(`DROP INDEX ix_ai_jobs_next_retry ON ai_jobs;`);
    await queryRunner.query(`ALTER TABLE ai_jobs DROP COLUMN next_retry_after, DROP COLUMN max_attempts, DROP COLUMN attempt_count;`);
  }
}
