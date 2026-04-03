import { MigrationInterface, QueryRunner } from "typeorm";

export class CodeChangeIntelligencePipeline0321776000000000 implements MigrationInterface {
  name = "CodeChangeIntelligencePipeline0321776000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS change_requests (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        workspace_id CHAR(36) NULL,
        source_message_id CHAR(36) NULL,
        title VARCHAR(200) NOT NULL,
        requested_goal TEXT NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'queued',
        priority VARCHAR(16) NOT NULL DEFAULT 'normal',
        trust_level VARCHAR(16) NOT NULL DEFAULT 'controlled',
        approval_required TINYINT(1) NOT NULL DEFAULT 0,
        approved_at DATETIME NULL,
        approved_by VARCHAR(120) NULL,
        final_result_json JSON NULL,
        confidence_level VARCHAR(16) NULL,
        failure_reason TEXT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY ix_change_requests_status (status),
        KEY ix_change_requests_priority (priority),
        KEY ix_change_requests_trust (trust_level),
        KEY ix_change_requests_source_message (source_message_id),
        CONSTRAINT fk_change_requests_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_change_requests_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS change_audits (
        id CHAR(36) NOT NULL,
        change_request_id CHAR(36) NOT NULL,
        summary TEXT NOT NULL,
        impacted_areas JSON NOT NULL,
        related_files JSON NOT NULL,
        architecture_notes TEXT NOT NULL,
        risk_notes TEXT NOT NULL,
        security_notes TEXT NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY ix_change_audits_req (change_request_id),
        CONSTRAINT fk_change_audits_req FOREIGN KEY (change_request_id) REFERENCES change_requests(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS change_plans (
        id CHAR(36) NOT NULL,
        change_request_id CHAR(36) NOT NULL,
        plan_summary TEXT NOT NULL,
        files_to_modify JSON NOT NULL,
        files_to_create JSON NOT NULL,
        migrations_required TINYINT(1) NOT NULL DEFAULT 0,
        test_plan TEXT NOT NULL,
        rollback_notes TEXT NOT NULL,
        approval_required TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY ix_change_plans_req (change_request_id),
        CONSTRAINT fk_change_plans_req FOREIGN KEY (change_request_id) REFERENCES change_requests(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS change_execution_runs (
        id CHAR(36) NOT NULL,
        change_request_id CHAR(36) NOT NULL,
        sandbox_run_id CHAR(36) NULL,
        execution_summary TEXT NOT NULL,
        files_changed JSON NOT NULL,
        patch_summary TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'running',
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY ix_change_exec_req (change_request_id),
        KEY ix_change_exec_status (status),
        CONSTRAINT fk_change_exec_req FOREIGN KEY (change_request_id) REFERENCES change_requests(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS change_verification_reports (
        id CHAR(36) NOT NULL,
        change_request_id CHAR(36) NOT NULL,
        verification_summary TEXT NOT NULL,
        tests_run JSON NOT NULL,
        checks_performed JSON NOT NULL,
        proven_safe_areas TEXT NOT NULL,
        unproven_areas TEXT NOT NULL,
        regression_notes TEXT NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY ix_change_verify_req (change_request_id),
        CONSTRAINT fk_change_verify_req FOREIGN KEY (change_request_id) REFERENCES change_requests(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS change_patch_reviews (
        id CHAR(36) NOT NULL,
        change_request_id CHAR(36) NOT NULL,
        review_summary TEXT NOT NULL,
        issues_found JSON NOT NULL,
        issues_fixed JSON NOT NULL,
        residual_risks TEXT NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY ix_change_patch_review_req (change_request_id),
        CONSTRAINT fk_change_patch_review_req FOREIGN KEY (change_request_id) REFERENCES change_requests(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`DROP TABLE IF EXISTS change_patch_reviews;`);
    await queryRunner.query(`DROP TABLE IF EXISTS change_verification_reports;`);
    await queryRunner.query(`DROP TABLE IF EXISTS change_execution_runs;`);
    await queryRunner.query(`DROP TABLE IF EXISTS change_plans;`);
    await queryRunner.query(`DROP TABLE IF EXISTS change_audits;`);
    await queryRunner.query(`DROP TABLE IF EXISTS change_requests;`);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }
}
