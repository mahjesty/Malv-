import { MigrationInterface, QueryRunner } from "typeorm";

export class TypedActionsRbacRateLimit0131774300006000 implements MigrationInterface {
  name = "TypedActionsRbacRateLimit0131774300006000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sandbox_typed_actions (
        id CHAR(36) NOT NULL,
        sandbox_run_id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        step_index INT NOT NULL,
        action_type VARCHAR(40) NOT NULL,
        scope_type VARCHAR(30) NOT NULL DEFAULT 'workspace',
        scope_ref VARCHAR(500) NULL,
        parameters_json JSON NOT NULL,
        normalized_parameters_json JSON NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'queued',
        started_at DATETIME NULL,
        finished_at DATETIME NULL,
        output_summary TEXT NULL,
        output_meta JSON NULL,
        primary_command_record_id CHAR(36) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY ix_sandbox_typed_actions_sandbox_run_id (sandbox_run_id),
        KEY ix_sandbox_typed_actions_user_id (user_id),
        KEY ix_sandbox_typed_actions_step_index (step_index),
        KEY ix_sandbox_typed_actions_action_type (action_type),
        KEY ix_sandbox_typed_actions_scope_type (scope_type),
        KEY ix_sandbox_typed_actions_status (status),
        KEY ix_sandbox_typed_actions_primary_command_record_id (primary_command_record_id),
        CONSTRAINT fk_sandbox_typed_actions_run FOREIGN KEY (sandbox_run_id) REFERENCES sandbox_runs(id) ON DELETE CASCADE,
        CONSTRAINT fk_sandbox_typed_actions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_sandbox_typed_actions_cmd FOREIGN KEY (primary_command_record_id) REFERENCES sandbox_command_records(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sandbox_typed_action_policy_decisions (
        id CHAR(36) NOT NULL,
        sandbox_typed_action_id CHAR(36) NOT NULL,
        sandbox_run_id CHAR(36) NOT NULL,
        policy_version_id CHAR(36) NOT NULL,
        requested_action_type VARCHAR(40) NOT NULL,
        requested_parameters_json JSON NOT NULL,
        normalized_parameters_json JSON NOT NULL,
        action_category VARCHAR(40) NOT NULL,
        risk_level VARCHAR(20) NOT NULL,
        decision VARCHAR(20) NOT NULL,
        decision_reason TEXT NOT NULL,
        matched_rule_id VARCHAR(120) NULL,
        rewritten_parameters_json JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY ix_sandbox_typed_action_policy_decisions_typed_action_id (sandbox_typed_action_id),
        KEY ix_sandbox_typed_action_policy_decisions_run_id (sandbox_run_id),
        KEY ix_sandbox_typed_action_policy_decisions_policy_version_id (policy_version_id),
        KEY ix_sandbox_typed_action_policy_decisions_decision (decision),
        CONSTRAINT fk_sandbox_typed_action_policy_decisions_typed_action FOREIGN KEY (sandbox_typed_action_id) REFERENCES sandbox_typed_actions(id) ON DELETE CASCADE,
        CONSTRAINT fk_sandbox_typed_action_policy_decisions_run FOREIGN KEY (sandbox_run_id) REFERENCES sandbox_runs(id) ON DELETE CASCADE,
        CONSTRAINT fk_sandbox_typed_action_policy_decisions_policy FOREIGN KEY (policy_version_id) REFERENCES policy_versions(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS rate_limit_events (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NULL,
        route_key VARCHAR(120) NOT NULL,
        limit_key VARCHAR(200) NOT NULL,
        hit_count INT NOT NULL DEFAULT 1,
        window_seconds INT NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY ix_rate_limit_events_route_key (route_key),
        KEY ix_rate_limit_events_created_at (created_at),
        KEY ix_rate_limit_events_user_id (user_id),
        CONSTRAINT fk_rate_limit_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);
    await queryRunner.query(`
      INSERT INTO permissions (id, permission_key, permission_name, description, is_active, created_at)
      SELECT UUID(), t.permission_key, t.permission_name, t.description, 1, CURRENT_TIMESTAMP(3)
      FROM (
        SELECT 'admin.runtime.read' AS permission_key, 'Admin runtime read' AS permission_name, 'Read sandbox runtime details' AS description
        UNION ALL SELECT 'admin.runtime.replay', 'Admin runtime replay', 'Read replay timeline'
        UNION ALL SELECT 'admin.patch.read', 'Admin patch read', 'Read patch details'
        UNION ALL SELECT 'admin.jobs.read', 'Admin jobs read', 'Read lease and job state'
        UNION ALL SELECT 'admin.dashboard.read', 'Admin dashboard read', 'Read supervisor dashboard'
        UNION ALL SELECT 'admin.reviews.read', 'Admin reviews read', 'Read review sessions/findings'
        UNION ALL SELECT 'admin.policies.read', 'Admin policies read', 'Read policy versions'
        UNION ALL SELECT 'sandbox.run.approve', 'Sandbox run approve', 'Approve sandbox runs'
        UNION ALL SELECT 'sandbox.approvals.read', 'Sandbox approvals read', 'Read approval requests'
        UNION ALL SELECT 'sandbox.approvals.resolve', 'Sandbox approvals resolve', 'Approve/reject approval requests'
        UNION ALL SELECT 'sandbox.policy.read', 'Sandbox policy read', 'Read policy decisions'
        UNION ALL SELECT 'sandbox.patches.read', 'Sandbox patch read', 'Read patch proposals'
        UNION ALL SELECT 'sandbox.patches.apply', 'Sandbox patch apply', 'Apply/reject patch proposals'
        UNION ALL SELECT 'sandbox.audit.read', 'Sandbox audit read', 'Read command audit'
      ) AS t
      WHERE NOT EXISTS (
        SELECT 1 FROM permissions p WHERE p.permission_key = t.permission_key
      );
    `);
    await queryRunner.query(`
      INSERT INTO role_permissions (id, role_id, permission_id, granted, created_at)
      SELECT UUID(), r.id, p.id, 1, CURRENT_TIMESTAMP(3)
      FROM roles r
      JOIN permissions p ON 1=1
      WHERE r.role_key = 'admin'
      AND NOT EXISTS (
        SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
      );
    `);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`DROP TABLE IF EXISTS rate_limit_events;`);
    await queryRunner.query(`DROP TABLE IF EXISTS sandbox_typed_action_policy_decisions;`);
    await queryRunner.query(`DROP TABLE IF EXISTS sandbox_typed_actions;`);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }
}
