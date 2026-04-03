import { MigrationInterface, QueryRunner } from "typeorm";

export class AiJobsBeast0041774022834392 implements MigrationInterface {
  name = "AiJobsBeast0041774022834392";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ai_workers (
        id CHAR(36) NOT NULL,
        worker_type VARCHAR(40) NOT NULL,
        node_name VARCHAR(160) NOT NULL,
        base_url VARCHAR(255) NOT NULL,
        status VARCHAR(60) NOT NULL DEFAULT 'online',
        capabilities JSON NULL,
        last_seen_at DATETIME NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_ai_workers_worker_type (worker_type),
        KEY ix_ai_workers_last_seen_at (last_seen_at)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ai_jobs (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        conversation_id CHAR(36) NULL,
        job_type VARCHAR(60) NOT NULL,
        requested_mode VARCHAR(20) NOT NULL,
        classified_mode VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'queued',
        progress INT NOT NULL DEFAULT 0,
        payload JSON NULL,
        result_reply LONGTEXT NULL,
        result_meta JSON NULL,
        error_message VARCHAR(1200) NULL,
        beast_level VARCHAR(1200) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        finished_at DATETIME NULL,
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_ai_jobs_user_id (user_id),
        KEY ix_ai_jobs_status (status),
        KEY ix_ai_jobs_conversation_id (conversation_id),
        CONSTRAINT fk_ai_jobs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_ai_jobs_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS suggestion_records (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        ai_job_id CHAR(36) NULL,
        suggestion_type VARCHAR(40) NOT NULL,
        risk_level VARCHAR(10) NOT NULL DEFAULT 'low',
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        content TEXT NOT NULL,
        metadata JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_suggestion_records_user_id (user_id),
        KEY ix_suggestion_records_ai_job_id (ai_job_id),
        CONSTRAINT fk_suggestion_records_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_suggestion_records_job FOREIGN KEY (ai_job_id) REFERENCES ai_jobs(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS beast_activity_logs (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        ai_job_id CHAR(36) NULL,
        event_type VARCHAR(50) NOT NULL,
        payload JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_beast_activity_logs_user_id (user_id),
        KEY ix_beast_activity_logs_job_id (ai_job_id),
        CONSTRAINT fk_beast_activity_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_beast_activity_logs_job FOREIGN KEY (ai_job_id) REFERENCES ai_jobs(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`DROP TABLE IF EXISTS beast_activity_logs;`);
    await queryRunner.query(`DROP TABLE IF EXISTS suggestion_records;`);
    await queryRunner.query(`DROP TABLE IF EXISTS ai_jobs;`);
    await queryRunner.query(`DROP TABLE IF EXISTS ai_workers;`);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }
}

