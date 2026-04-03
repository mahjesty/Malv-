import { MigrationInterface, QueryRunner } from "typeorm";

export class FullSchemaRest0051774023271666 implements MigrationInterface {
  name = "FullSchemaRest0051774023271666";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        device_type VARCHAR(40) NOT NULL,
        name VARCHAR(160) NOT NULL,
        trust_state VARCHAR(20) NOT NULL DEFAULT 'untrusted',
        command_permissions JSON NULL,
        last_seen_at DATETIME NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_devices_user_id (user_id),
        CONSTRAINT fk_devices_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS call_sessions (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        kind VARCHAR(20) NOT NULL, -- voice|video
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        started_at DATETIME NOT NULL,
        ended_at DATETIME NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_call_sessions_user_id (user_id),
        CONSTRAINT fk_call_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS call_transcripts (
        id CHAR(36) NOT NULL,
        call_session_id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        speaker_role VARCHAR(20) NOT NULL, -- user|malv|support|system
        content TEXT NOT NULL,
        start_time_ms INT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_call_transcripts_call_session_id (call_session_id),
        KEY ix_call_transcripts_user_id (user_id),
        CONSTRAINT fk_call_transcripts_call FOREIGN KEY (call_session_id) REFERENCES call_sessions(id) ON DELETE CASCADE,
        CONSTRAINT fk_call_transcripts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS settings_profiles (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        preferences JSON NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_settings_profiles_user_id (user_id),
        CONSTRAINT fk_settings_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS files (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        file_kind VARCHAR(30) NOT NULL, -- pdf|image|audio|video|doc|text
        original_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NULL,
        size_bytes BIGINT NULL,
        storage_uri VARCHAR(500) NOT NULL, -- local/private path or object key
        checksum CHAR(64) NULL,
        metadata JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_files_user_id (user_id),
        CONSTRAINT fk_files_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS file_contexts (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        file_id CHAR(36) NOT NULL,
        context_type VARCHAR(50) NOT NULL, -- chat|vault|support|device
        context_id CHAR(36) NULL,
        metadata JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_file_contexts_user_id (user_id),
        KEY ix_file_contexts_file_id (file_id),
        CONSTRAINT fk_file_contexts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_file_contexts_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS support_categories (
        id CHAR(36) NOT NULL,
        name VARCHAR(120) NOT NULL,
        slug VARCHAR(120) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_support_categories_slug (slug)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS support_articles (
        id CHAR(36) NOT NULL,
        category_id CHAR(36) NOT NULL,
        title VARCHAR(200) NOT NULL,
        body TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'published',
        metadata JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_support_articles_category_id (category_id),
        CONSTRAINT fk_support_articles_category FOREIGN KEY (category_id) REFERENCES support_categories(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS article_relations (
        id CHAR(36) NOT NULL,
        from_article_id CHAR(36) NOT NULL,
        to_article_id CHAR(36) NOT NULL,
        relation_type VARCHAR(30) NOT NULL DEFAULT 'related',
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_article_relations_from (from_article_id),
        KEY ix_article_relations_to (to_article_id),
        CONSTRAINT fk_article_relations_from FOREIGN KEY (from_article_id) REFERENCES support_articles(id) ON DELETE CASCADE,
        CONSTRAINT fk_article_relations_to FOREIGN KEY (to_article_id) REFERENCES support_articles(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        category_id CHAR(36) NOT NULL,
        priority VARCHAR(20) NOT NULL DEFAULT 'normal',
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        subject VARCHAR(220) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        closed_at DATETIME NULL,
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_support_tickets_user_id (user_id),
        KEY ix_support_tickets_status (status),
        CONSTRAINT fk_support_tickets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_support_tickets_category FOREIGN KEY (category_id) REFERENCES support_categories(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS support_messages (
        id CHAR(36) NOT NULL,
        ticket_id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        from_role VARCHAR(20) NOT NULL, -- user|support|admin|system
        content TEXT NOT NULL,
        internal_note BOOLEAN NOT NULL DEFAULT FALSE,
        metadata JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_support_messages_ticket_id (ticket_id),
        KEY ix_support_messages_user_id (user_id),
        CONSTRAINT fk_support_messages_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
        CONSTRAINT fk_support_messages_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        notif_type VARCHAR(50) NOT NULL,
        title VARCHAR(200) NOT NULL,
        body TEXT NOT NULL,
        metadata JSON NULL,
        read_at DATETIME NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_notifications_user_id (user_id),
        KEY ix_notifications_read_at (read_at),
        CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS admin_logs (
        id CHAR(36) NOT NULL,
        actor_user_id CHAR(36) NULL,
        action_type VARCHAR(80) NOT NULL,
        target_type VARCHAR(80) NULL,
        target_id CHAR(36) NULL,
        metadata JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_admin_logs_actor (actor_user_id),
        CONSTRAINT fk_admin_logs_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS feature_flags (
        id CHAR(36) NOT NULL,
        flag_key VARCHAR(120) NOT NULL,
        value JSON NOT NULL,
        scope VARCHAR(60) NOT NULL DEFAULT 'global',
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_feature_flags_key_scope (flag_key, scope)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS evolve_requests (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        goal TEXT NOT NULL,
        scope TEXT NULL,
        reason TEXT NULL,
        risk_level VARCHAR(20) NOT NULL DEFAULT 'medium',
        desired_outcome TEXT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        decided_at DATETIME NULL,
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_evolve_requests_user_id (user_id),
        KEY ix_evolve_requests_status (status),
        CONSTRAINT fk_evolve_requests_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sandbox_runs (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        run_type VARCHAR(60) NOT NULL, -- action_prep|self_evolve|tool_exec
        status VARCHAR(20) NOT NULL DEFAULT 'staged',
        policy_version VARCHAR(60) NULL,
        input_payload JSON NULL,
        output_payload JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        finished_at DATETIME NULL,
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_sandbox_runs_user_id (user_id),
        KEY ix_sandbox_runs_status (status),
        CONSTRAINT fk_sandbox_runs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit_events (
        id CHAR(36) NOT NULL,
        actor_user_id CHAR(36) NULL,
        event_type VARCHAR(100) NOT NULL,
        level VARCHAR(20) NOT NULL DEFAULT 'info',
        message TEXT NULL,
        metadata JSON NULL,
        occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_audit_events_actor (actor_user_id),
        CONSTRAINT fk_audit_events_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`DROP TABLE IF EXISTS audit_events;`);
    await queryRunner.query(`DROP TABLE IF EXISTS sandbox_runs;`);
    await queryRunner.query(`DROP TABLE IF EXISTS evolve_requests;`);
    await queryRunner.query(`DROP TABLE IF EXISTS feature_flags;`);
    await queryRunner.query(`DROP TABLE IF EXISTS admin_logs;`);
    await queryRunner.query(`DROP TABLE IF EXISTS notifications;`);
    await queryRunner.query(`DROP TABLE IF EXISTS support_messages;`);
    await queryRunner.query(`DROP TABLE IF EXISTS support_tickets;`);
    await queryRunner.query(`DROP TABLE IF EXISTS article_relations;`);
    await queryRunner.query(`DROP TABLE IF EXISTS support_articles;`);
    await queryRunner.query(`DROP TABLE IF EXISTS support_categories;`);
    await queryRunner.query(`DROP TABLE IF EXISTS file_contexts;`);
    await queryRunner.query(`DROP TABLE IF EXISTS files;`);
    await queryRunner.query(`DROP TABLE IF EXISTS settings_profiles;`);
    await queryRunner.query(`DROP TABLE IF EXISTS call_transcripts;`);
    await queryRunner.query(`DROP TABLE IF EXISTS call_sessions;`);
    await queryRunner.query(`DROP TABLE IF EXISTS devices;`);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }
}

