import { MigrationInterface, QueryRunner } from "typeorm";

export class ApprovalControlPlane0111774100004000 implements MigrationInterface {
  name = "ApprovalControlPlane0111774100004000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sandbox_approval_requests (
        id CHAR(36) NOT NULL,
        sandbox_run_id CHAR(36) NOT NULL,
        sandbox_command_record_id CHAR(36) NULL,
        sandbox_policy_decision_id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        approval_type VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        requested_command TEXT NULL,
        normalized_command TEXT NULL,
        risk_level VARCHAR(20) NULL,
        reason TEXT NULL,
        current_step_index INT NULL,
        requested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        resolved_at DATETIME NULL,
        resolved_by VARCHAR(120) NULL,
        resolution_note TEXT NULL,
        PRIMARY KEY (id),
        KEY ix_sandbox_approval_requests_sandbox_run_id (sandbox_run_id),
        KEY ix_sandbox_approval_requests_sandbox_command_record_id (sandbox_command_record_id),
        KEY ix_sandbox_approval_requests_sandbox_policy_decision_id (sandbox_policy_decision_id),
        KEY ix_sandbox_approval_requests_user_id (user_id),
        KEY ix_sandbox_approval_requests_approval_type (approval_type),
        KEY ix_sandbox_approval_requests_status (status),
        KEY ix_sandbox_approval_requests_risk_level (risk_level),
        CONSTRAINT fk_sandbox_approval_requests_run FOREIGN KEY (sandbox_run_id) REFERENCES sandbox_runs(id) ON DELETE CASCADE,
        CONSTRAINT fk_sandbox_approval_requests_command FOREIGN KEY (sandbox_command_record_id) REFERENCES sandbox_command_records(id) ON DELETE SET NULL,
        CONSTRAINT fk_sandbox_approval_requests_policy_decision FOREIGN KEY (sandbox_policy_decision_id) REFERENCES sandbox_command_policy_decisions(id) ON DELETE CASCADE,
        CONSTRAINT fk_sandbox_approval_requests_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      ALTER TABLE sandbox_patch_proposals
      ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(120) NULL,
      ADD COLUMN IF NOT EXISTS reviewed_at DATETIME NULL,
      ADD COLUMN IF NOT EXISTS review_note TEXT NULL,
      ADD COLUMN IF NOT EXISTS applied_at DATETIME NULL,
      ADD COLUMN IF NOT EXISTS apply_error TEXT NULL;
    `);

    await queryRunner.query(`
      UPDATE sandbox_patch_proposals
      SET status = 'pending'
      WHERE status = 'proposed';
    `);

    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`DROP TABLE IF EXISTS sandbox_approval_requests;`);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }
}

