import { MigrationInterface, QueryRunner } from "typeorm";

export class SandboxPolicyDecisions0081774100001000 implements MigrationInterface {
  name = "SandboxPolicyDecisions0081774100001000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sandbox_policy_decisions (
        id CHAR(36) NOT NULL,
        sandbox_run_id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        step_index INT NOT NULL,
        decision VARCHAR(20) NOT NULL,
        reason_code VARCHAR(120) NOT NULL,
        metadata JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_sandbox_policy_decisions_step_index (step_index),
        CONSTRAINT fk_sandbox_policy_decisions_run FOREIGN KEY (sandbox_run_id) REFERENCES sandbox_runs(id) ON DELETE CASCADE,
        CONSTRAINT fk_sandbox_policy_decisions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`DROP TABLE IF EXISTS sandbox_policy_decisions;`);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }
}

