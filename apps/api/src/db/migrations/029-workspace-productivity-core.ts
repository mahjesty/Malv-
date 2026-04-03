import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceProductivityCore0291775000000000 implements MigrationInterface {
  name = "WorkspaceProductivityCore0291775000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspace_tasks (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        title VARCHAR(220) NOT NULL,
        description TEXT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'todo',
        source VARCHAR(20) NOT NULL DEFAULT 'manual',
        conversation_id CHAR(36) NULL,
        call_session_id CHAR(36) NULL,
        room_id CHAR(36) NULL,
        source_fingerprint VARCHAR(140) NULL,
        metadata JSON NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY ix_workspace_tasks_user_id (user_id),
        KEY ix_workspace_tasks_title (title),
        KEY ix_workspace_tasks_status (status),
        KEY ix_workspace_tasks_source (source),
        KEY ix_workspace_tasks_conversation_id (conversation_id),
        KEY ix_workspace_tasks_call_session_id (call_session_id),
        KEY ix_workspace_tasks_room_id (room_id),
        KEY ix_workspace_tasks_source_fingerprint (source_fingerprint),
        UNIQUE KEY ix_workspace_tasks_user_source_fingerprint_unique (user_id, source_fingerprint),
        CONSTRAINT fk_workspace_tasks_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspace_approval_items (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        source VARCHAR(20) NOT NULL DEFAULT 'other',
        source_ref_id VARCHAR(64) NULL,
        action_description TEXT NOT NULL,
        risk_level VARCHAR(20) NOT NULL DEFAULT 'medium',
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        conversation_id CHAR(36) NULL,
        call_session_id CHAR(36) NULL,
        room_id CHAR(36) NULL,
        resolved_by VARCHAR(120) NULL,
        resolved_at DATETIME NULL,
        metadata JSON NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY ix_workspace_approval_items_user_id (user_id),
        KEY ix_workspace_approval_items_source (source),
        KEY ix_workspace_approval_items_source_ref_id (source_ref_id),
        KEY ix_workspace_approval_items_risk_level (risk_level),
        KEY ix_workspace_approval_items_status (status),
        KEY ix_workspace_approval_items_conversation_id (conversation_id),
        KEY ix_workspace_approval_items_call_session_id (call_session_id),
        KEY ix_workspace_approval_items_room_id (room_id),
        UNIQUE KEY ix_workspace_approvals_user_source_ref_unique (user_id, source, source_ref_id),
        CONSTRAINT fk_workspace_approval_items_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Non-destructive migration rollback policy.
  }
}
