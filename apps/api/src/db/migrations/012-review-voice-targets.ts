import { MigrationInterface, QueryRunner } from "typeorm";

export class ReviewVoiceTargets0121774200005000 implements MigrationInterface {
  name = "ReviewVoiceTargets0121774200005000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS operator_targets (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        target_type VARCHAR(20) NOT NULL,
        canonical_ref VARCHAR(500) NOT NULL,
        confidence_score DECIMAL(5,4) NOT NULL DEFAULT 0,
        resolution_metadata JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY ix_operator_targets_target_type (target_type),
        KEY ix_operator_targets_user_id (user_id),
        CONSTRAINT fk_operator_targets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS review_sessions (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        voice_operator_event_id CHAR(36) NULL,
        ai_job_id CHAR(36) NULL,
        sandbox_run_id CHAR(36) NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'running',
        target_type VARCHAR(20) NOT NULL,
        target_ref VARCHAR(500) NULL,
        target_metadata JSON NULL,
        plan_summary JSON NULL,
        result_summary TEXT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY ix_review_sessions_status (status),
        KEY ix_review_sessions_target_type (target_type),
        KEY ix_review_sessions_user_id (user_id),
        CONSTRAINT fk_review_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_review_sessions_voice_event FOREIGN KEY (voice_operator_event_id) REFERENCES voice_operator_events(id) ON DELETE SET NULL,
        CONSTRAINT fk_review_sessions_ai_job FOREIGN KEY (ai_job_id) REFERENCES ai_jobs(id) ON DELETE SET NULL,
        CONSTRAINT fk_review_sessions_sandbox_run FOREIGN KEY (sandbox_run_id) REFERENCES sandbox_runs(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS review_findings (
        id CHAR(36) NOT NULL,
        review_session_id CHAR(36) NOT NULL,
        severity VARCHAR(20) NOT NULL,
        category VARCHAR(30) NOT NULL,
        title VARCHAR(255) NOT NULL,
        explanation TEXT NOT NULL,
        evidence TEXT NULL,
        suggested_fix TEXT NULL,
        patch_proposal_id CHAR(36) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY ix_review_findings_review_session_id (review_session_id),
        KEY ix_review_findings_severity (severity),
        KEY ix_review_findings_category (category),
        CONSTRAINT fk_review_findings_session FOREIGN KEY (review_session_id) REFERENCES review_sessions(id) ON DELETE CASCADE,
        CONSTRAINT fk_review_findings_patch FOREIGN KEY (patch_proposal_id) REFERENCES sandbox_patch_proposals(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      ALTER TABLE voice_operator_events
      ADD COLUMN IF NOT EXISTS ai_job_id CHAR(36) NULL,
      ADD COLUMN IF NOT EXISTS sandbox_run_id CHAR(36) NULL,
      ADD COLUMN IF NOT EXISTS review_session_id CHAR(36) NULL,
      ADD COLUMN IF NOT EXISTS operator_target_id CHAR(36) NULL,
      ADD COLUMN IF NOT EXISTS resolution_confidence DECIMAL(5,4) NULL;
    `);
    await queryRunner.query(`CREATE INDEX ix_voice_operator_events_ai_job_id ON voice_operator_events(ai_job_id);`);
    await queryRunner.query(`CREATE INDEX ix_voice_operator_events_sandbox_run_id ON voice_operator_events(sandbox_run_id);`);
    await queryRunner.query(`CREATE INDEX ix_voice_operator_events_review_session_id ON voice_operator_events(review_session_id);`);
    await queryRunner.query(`CREATE INDEX ix_voice_operator_events_operator_target_id ON voice_operator_events(operator_target_id);`);

    await queryRunner.query(`
      ALTER TABLE voice_operator_events
      ADD CONSTRAINT fk_voice_operator_events_ai_job FOREIGN KEY (ai_job_id) REFERENCES ai_jobs(id) ON DELETE SET NULL,
      ADD CONSTRAINT fk_voice_operator_events_sandbox_run FOREIGN KEY (sandbox_run_id) REFERENCES sandbox_runs(id) ON DELETE SET NULL,
      ADD CONSTRAINT fk_voice_operator_events_review_session FOREIGN KEY (review_session_id) REFERENCES review_sessions(id) ON DELETE SET NULL,
      ADD CONSTRAINT fk_voice_operator_events_operator_target FOREIGN KEY (operator_target_id) REFERENCES operator_targets(id) ON DELETE SET NULL;
    `);

    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`DROP TABLE IF EXISTS review_findings;`);
    await queryRunner.query(`DROP TABLE IF EXISTS review_sessions;`);
    await queryRunner.query(`DROP TABLE IF EXISTS operator_targets;`);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }
}
