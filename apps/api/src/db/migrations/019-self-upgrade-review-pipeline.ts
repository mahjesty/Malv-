import { MigrationInterface, QueryRunner } from "typeorm";

export class SelfUpgradeReviewPipeline0191776000000000 implements MigrationInterface {
  name = "SelfUpgradeReviewPipeline0191776000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS self_upgrade_requests (
        id CHAR(36) NOT NULL,
        title VARCHAR(200) NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'draft',
        created_by_user_id CHAR(36) NOT NULL,
        sandbox_run_id CHAR(36) NULL,
        sandbox_worktree_path VARCHAR(1024) NULL,
        context_json JSON NULL,
        failure_reason TEXT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY ix_self_upgrade_req_status (status),
        KEY ix_self_upgrade_req_user (created_by_user_id),
        CONSTRAINT fk_self_upgrade_req_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_self_upgrade_req_sandbox_run FOREIGN KEY (sandbox_run_id) REFERENCES sandbox_runs(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS self_upgrade_analysis_reports (
        id CHAR(36) NOT NULL,
        request_id CHAR(36) NOT NULL,
        architecture_understanding JSON NOT NULL,
        files_examined JSON NOT NULL,
        affected_modules JSON NOT NULL,
        dependency_notes JSON NOT NULL,
        study_summary TEXT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY ix_self_upgrade_analysis_req (request_id),
        CONSTRAINT fk_self_upgrade_analysis_req FOREIGN KEY (request_id) REFERENCES self_upgrade_requests(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS self_upgrade_patch_sets (
        id CHAR(36) NOT NULL,
        request_id CHAR(36) NOT NULL,
        sandbox_run_id CHAR(36) NULL,
        sandbox_patch_proposal_id CHAR(36) NULL,
        diff_text LONGTEXT NOT NULL,
        changed_files JSON NOT NULL,
        validation_summary JSON NOT NULL,
        validation_passed TINYINT(1) NOT NULL DEFAULT 0,
        risk_notes JSON NULL,
        rollback_plan TEXT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY ix_self_upgrade_patch_req (request_id),
        CONSTRAINT fk_self_upgrade_patch_req FOREIGN KEY (request_id) REFERENCES self_upgrade_requests(id) ON DELETE CASCADE,
        CONSTRAINT fk_self_upgrade_patch_sandbox_run FOREIGN KEY (sandbox_run_id) REFERENCES sandbox_runs(id) ON DELETE SET NULL,
        CONSTRAINT fk_self_upgrade_patch_proposal FOREIGN KEY (sandbox_patch_proposal_id) REFERENCES sandbox_patch_proposals(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS self_upgrade_review_sessions (
        id CHAR(36) NOT NULL,
        request_id CHAR(36) NOT NULL,
        analysis_report_id CHAR(36) NOT NULL,
        patch_set_id CHAR(36) NOT NULL,
        preview_status VARCHAR(32) NOT NULL DEFAULT 'draft',
        changed_files JSON NOT NULL,
        diff_summary TEXT NOT NULL,
        validation_summary JSON NOT NULL,
        risk_summary TEXT NOT NULL,
        rollback_summary TEXT NOT NULL,
        ready_for_apply TINYINT(1) NOT NULL DEFAULT 0,
        admin_notes TEXT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY ix_self_upgrade_review_req (request_id),
        KEY ix_self_upgrade_review_status (preview_status),
        CONSTRAINT fk_self_upgrade_review_req FOREIGN KEY (request_id) REFERENCES self_upgrade_requests(id) ON DELETE CASCADE,
        CONSTRAINT fk_self_upgrade_review_analysis FOREIGN KEY (analysis_report_id) REFERENCES self_upgrade_analysis_reports(id) ON DELETE CASCADE,
        CONSTRAINT fk_self_upgrade_review_patch FOREIGN KEY (patch_set_id) REFERENCES self_upgrade_patch_sets(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`DROP TABLE IF EXISTS self_upgrade_review_sessions;`);
    await queryRunner.query(`DROP TABLE IF EXISTS self_upgrade_patch_sets;`);
    await queryRunner.query(`DROP TABLE IF EXISTS self_upgrade_analysis_reports;`);
    await queryRunner.query(`DROP TABLE IF EXISTS self_upgrade_requests;`);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }
}
