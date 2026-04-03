import { MigrationInterface, QueryRunner } from "typeorm";

export class RealtimeCollaborationIntelligence0301776000000000 implements MigrationInterface {
  name = "RealtimeCollaborationIntelligence0301776000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE workspace_tasks
      ADD COLUMN assignee_user_id CHAR(36) NULL AFTER user_id
    `);
    await queryRunner.query(`
      CREATE INDEX ix_workspace_tasks_assignee_user_id
      ON workspace_tasks (assignee_user_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspace_activity_events (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        activity_type VARCHAR(48) NOT NULL,
        workspace_id CHAR(36) NULL,
        room_id CHAR(36) NULL,
        conversation_id CHAR(36) NULL,
        entity_id CHAR(36) NULL,
        title VARCHAR(240) NOT NULL,
        payload_json JSON NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY ix_workspace_activity_events_user_id (user_id),
        KEY ix_workspace_activity_events_activity_type (activity_type),
        KEY ix_workspace_activity_events_workspace_id (workspace_id),
        KEY ix_workspace_activity_events_room_id (room_id),
        KEY ix_workspace_activity_events_conversation_id (conversation_id),
        CONSTRAINT fk_workspace_activity_events_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS collaboration_summaries (
        id CHAR(36) NOT NULL,
        room_id CHAR(36) NOT NULL,
        conversation_id CHAR(36) NOT NULL,
        created_by_user_id CHAR(36) NOT NULL,
        workspace_id CHAR(36) NULL,
        trigger_kind VARCHAR(32) NOT NULL,
        message_count INT NOT NULL,
        summary_json JSON NOT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY ix_collaboration_summaries_room_id (room_id),
        KEY ix_collaboration_summaries_conversation_id (conversation_id),
        KEY ix_collaboration_summaries_created_by_user_id (created_by_user_id),
        KEY ix_collaboration_summaries_workspace_id (workspace_id),
        KEY ix_collaboration_summaries_trigger_kind (trigger_kind),
        CONSTRAINT fk_collaboration_summaries_room_id FOREIGN KEY (room_id) REFERENCES collaboration_rooms(id) ON DELETE CASCADE,
        CONSTRAINT fk_collaboration_summaries_conversation_id FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        CONSTRAINT fk_collaboration_summaries_created_by_user_id FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Non-destructive migration rollback policy.
  }
}
