import { MigrationInterface, QueryRunner } from "typeorm";

export class RuntimeIntelligenceScaling0071774100000000 implements MigrationInterface {
  name = "RuntimeIntelligenceScaling0071774100000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS call_sessions (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        kind VARCHAR(20) NOT NULL,
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
        speaker_role VARCHAR(20) NOT NULL,
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
      CREATE TABLE IF NOT EXISTS sandbox_command_records (
        id CHAR(36) NOT NULL,
        sandbox_run_id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        step_index INT NOT NULL,
        command_class VARCHAR(40) NOT NULL,
        command_text TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'queued',
        exit_code INT NULL,
        duration_ms INT NULL,
        stdout_text LONGTEXT NULL,
        stderr_text LONGTEXT NULL,
        parsed_result JSON NULL,
        metadata JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_sandbox_command_records_step_index (step_index),
        CONSTRAINT fk_sandbox_command_records_run FOREIGN KEY (sandbox_run_id) REFERENCES sandbox_runs(id) ON DELETE CASCADE,
        CONSTRAINT fk_sandbox_command_records_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sandbox_patch_proposals (
        id CHAR(36) NOT NULL,
        sandbox_run_id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'proposed',
        diff_text LONGTEXT NOT NULL,
        summary JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_sandbox_patch_proposals_status (status),
        CONSTRAINT fk_sandbox_patch_proposals_run FOREIGN KEY (sandbox_run_id) REFERENCES sandbox_runs(id) ON DELETE CASCADE,
        CONSTRAINT fk_sandbox_patch_proposals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS file_chunks (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        file_id CHAR(36) NOT NULL,
        chunk_index INT NOT NULL,
        content TEXT NOT NULL,
        token_estimate INT NOT NULL DEFAULT 0,
        metadata JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_file_chunks_chunk_index (chunk_index),
        CONSTRAINT fk_file_chunks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_file_chunks_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS file_embeddings (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        file_id CHAR(36) NOT NULL,
        file_chunk_id CHAR(36) NOT NULL,
        embedding_model VARCHAR(80) NOT NULL,
        embedding_vector JSON NOT NULL,
        metadata JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_file_embeddings_embedding_model (embedding_model),
        CONSTRAINT fk_file_embeddings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_file_embeddings_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
        CONSTRAINT fk_file_embeddings_chunk FOREIGN KEY (file_chunk_id) REFERENCES file_chunks(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ai_job_leases (
        id CHAR(36) NOT NULL,
        ai_job_id CHAR(36) NOT NULL,
        worker_node_name VARCHAR(160) NOT NULL,
        lease_token CHAR(64) NOT NULL,
        lease_expires_at DATETIME NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_ai_job_leases_ai_job_id (ai_job_id),
        KEY ix_ai_job_leases_worker_node_name (worker_node_name),
        KEY ix_ai_job_leases_lease_expires_at (lease_expires_at),
        CONSTRAINT fk_ai_job_leases_job FOREIGN KEY (ai_job_id) REFERENCES ai_jobs(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`DROP TABLE IF EXISTS ai_job_leases;`);
    await queryRunner.query(`DROP TABLE IF EXISTS file_embeddings;`);
    await queryRunner.query(`DROP TABLE IF EXISTS file_chunks;`);
    await queryRunner.query(`DROP TABLE IF EXISTS sandbox_patch_proposals;`);
    await queryRunner.query(`DROP TABLE IF EXISTS sandbox_command_records;`);
    await queryRunner.query(`DROP TABLE IF EXISTS call_transcripts;`);
    await queryRunner.query(`DROP TABLE IF EXISTS call_sessions;`);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }
}

