import { MigrationInterface, QueryRunner } from "typeorm";

export class MessageLifecycleStatusRun0161774022746226 implements MigrationInterface {
  name = "MessageLifecycleStatusRun0161774022746226";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE messages
        ADD COLUMN status VARCHAR(24) NOT NULL DEFAULT 'done' AFTER metadata,
        ADD COLUMN run_id CHAR(36) NULL AFTER status,
        ADD COLUMN source VARCHAR(40) NULL AFTER run_id,
        ADD KEY ix_messages_run_id (run_id)
    `);
    await queryRunner.query(`
      UPDATE messages SET status = 'done' WHERE status IS NULL OR status = ''
    `);
    await queryRunner.query(`
      ALTER TABLE messages
        ADD CONSTRAINT fk_messages_run_ai_job FOREIGN KEY (run_id) REFERENCES ai_jobs(id) ON DELETE SET NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE messages DROP FOREIGN KEY fk_messages_run_ai_job`);
    await queryRunner.query(`
      ALTER TABLE messages
        DROP KEY ix_messages_run_id,
        DROP COLUMN source,
        DROP COLUMN run_id,
        DROP COLUMN status
    `);
  }
}
