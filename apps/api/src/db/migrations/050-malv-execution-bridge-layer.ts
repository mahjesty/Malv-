import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Executor enrollment heartbeats, persisted notifications, durable continuity, external-action dispatch audit.
 */
export class MalvExecutionBridgeLayer05020260413120000 implements MigrationInterface {
  name = "MalvExecutionBridgeLayer05020260413120000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS malv_user_executor_enrollment (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        channel VARCHAR(24) NOT NULL,
        last_heartbeat_at DATETIME(3) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_malv_exec_enroll_user_channel (user_id, channel),
        KEY ix_malv_exec_enroll_heartbeat (user_id, last_heartbeat_at)
      ) ENGINE=InnoDB;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS malv_user_notification (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        kind VARCHAR(48) NOT NULL,
        title VARCHAR(240) NOT NULL,
        body TEXT NULL,
        payload_json JSON NULL,
        delivery_channel VARCHAR(40) NOT NULL,
        delivery_detail_json JSON NULL,
        task_id CHAR(36) NULL,
        correlation_id VARCHAR(64) NULL,
        read_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY ix_malv_notif_user_read (user_id, read_at),
        KEY ix_malv_notif_task (task_id)
      ) ENGINE=InnoDB;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS malv_user_continuity_state (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        session_key VARCHAR(128) NOT NULL,
        schema_version INT NOT NULL DEFAULT 1,
        payload_json JSON NOT NULL,
        expires_at DATETIME(3) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_malv_continuity_user_session (user_id, session_key),
        KEY ix_malv_continuity_expires (expires_at)
      ) ENGINE=InnoDB;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS malv_external_action_dispatch (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        task_id CHAR(36) NOT NULL,
        request_key VARCHAR(160) NOT NULL,
        correlation_id VARCHAR(64) NOT NULL,
        action_kind VARCHAR(48) NOT NULL,
        action_payload_json JSON NULL,
        status VARCHAR(32) NOT NULL,
        result_json JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_malv_ext_dispatch_task_req (task_id, request_key),
        KEY ix_malv_ext_dispatch_user (user_id),
        KEY ix_malv_ext_dispatch_status (status)
      ) ENGINE=InnoDB;
    `);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS malv_external_action_dispatch;`);
    await queryRunner.query(`DROP TABLE IF EXISTS malv_user_continuity_state;`);
    await queryRunner.query(`DROP TABLE IF EXISTS malv_user_notification;`);
    await queryRunner.query(`DROP TABLE IF EXISTS malv_user_executor_enrollment;`);
  }
}
