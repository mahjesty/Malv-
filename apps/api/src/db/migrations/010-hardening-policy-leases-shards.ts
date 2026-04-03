import { MigrationInterface, QueryRunner } from "typeorm";

export class HardeningPolicyLeasesShards0101774100003000 implements MigrationInterface {
  name = "HardeningPolicyLeasesShards0101774100003000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS policy_definitions (
        id CHAR(36) NOT NULL,
        name VARCHAR(160) NOT NULL,
        scope VARCHAR(60) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'active',
        description TEXT NULL,
        created_by VARCHAR(120) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY ix_policy_definitions_name (name),
        KEY ix_policy_definitions_scope (scope),
        KEY ix_policy_definitions_status (status)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS policy_versions (
        id CHAR(36) NOT NULL,
        policy_definition_id CHAR(36) NOT NULL,
        version INT NOT NULL,
        rules_json JSON NOT NULL,
        hash VARCHAR(128) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT FALSE,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_policy_versions_definition_version (policy_definition_id, version),
        KEY ix_policy_versions_hash (hash),
        KEY ix_policy_versions_is_active (is_active),
        CONSTRAINT fk_policy_versions_definition FOREIGN KEY (policy_definition_id) REFERENCES policy_definitions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sandbox_run_policy_bindings (
        id CHAR(36) NOT NULL,
        sandbox_run_id CHAR(36) NOT NULL,
        policy_definition_id CHAR(36) NOT NULL,
        policy_version_id CHAR(36) NOT NULL,
        binding_reason VARCHAR(120) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_sandbox_run_policy_bindings_run (sandbox_run_id),
        KEY ix_sandbox_run_policy_bindings_policy_definition_id (policy_definition_id),
        KEY ix_sandbox_run_policy_bindings_policy_version_id (policy_version_id),
        CONSTRAINT fk_sandbox_run_policy_bindings_run FOREIGN KEY (sandbox_run_id) REFERENCES sandbox_runs(id) ON DELETE CASCADE,
        CONSTRAINT fk_sandbox_run_policy_bindings_policy_definition FOREIGN KEY (policy_definition_id) REFERENCES policy_definitions(id) ON DELETE RESTRICT,
        CONSTRAINT fk_sandbox_run_policy_bindings_policy_version FOREIGN KEY (policy_version_id) REFERENCES policy_versions(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sandbox_command_policy_decisions (
        id CHAR(36) NOT NULL,
        sandbox_command_record_id CHAR(36) NOT NULL,
        sandbox_run_id CHAR(36) NOT NULL,
        policy_version_id CHAR(36) NOT NULL,
        requested_command TEXT NOT NULL,
        normalized_command TEXT NOT NULL,
        command_category VARCHAR(40) NOT NULL,
        risk_level VARCHAR(20) NOT NULL,
        decision VARCHAR(20) NOT NULL,
        decision_reason TEXT NOT NULL,
        matched_rule_id VARCHAR(120) NULL,
        rewritten_command TEXT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY ix_sandbox_command_policy_decisions_command_record_id (sandbox_command_record_id),
        KEY ix_sandbox_command_policy_decisions_sandbox_run_id (sandbox_run_id),
        KEY ix_sandbox_command_policy_decisions_policy_version_id (policy_version_id),
        KEY ix_sandbox_command_policy_decisions_command_category (command_category),
        KEY ix_sandbox_command_policy_decisions_risk_level (risk_level),
        KEY ix_sandbox_command_policy_decisions_decision (decision),
        CONSTRAINT fk_sandbox_command_policy_decisions_command_record FOREIGN KEY (sandbox_command_record_id) REFERENCES sandbox_command_records(id) ON DELETE CASCADE,
        CONSTRAINT fk_sandbox_command_policy_decisions_run FOREIGN KEY (sandbox_run_id) REFERENCES sandbox_runs(id) ON DELETE CASCADE,
        CONSTRAINT fk_sandbox_command_policy_decisions_policy_version FOREIGN KEY (policy_version_id) REFERENCES policy_versions(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      ALTER TABLE ai_jobs
      ADD COLUMN IF NOT EXISTS shard_key VARCHAR(120) NOT NULL DEFAULT 'default',
      ADD COLUMN IF NOT EXISTS queue_priority INT NOT NULL DEFAULT 50;
    `);
    await queryRunner.query(`CREATE INDEX ix_ai_jobs_shard_key ON ai_jobs(shard_key);`);
    await queryRunner.query(`CREATE INDEX ix_ai_jobs_queue_priority ON ai_jobs(queue_priority);`);

    await queryRunner.query(`
      ALTER TABLE ai_job_leases
      ADD COLUMN IF NOT EXISTS owner_node VARCHAR(160) NULL,
      ADD COLUMN IF NOT EXISTS owner_pid INT NULL,
      ADD COLUMN IF NOT EXISTS last_renewed_at DATETIME NULL,
      ADD COLUMN IF NOT EXISTS steal_count INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
    `);

    await queryRunner.query(`
      UPDATE ai_job_leases
      SET owner_node = COALESCE(owner_node, worker_node_name),
          last_renewed_at = COALESCE(last_renewed_at, created_at)
      WHERE owner_node IS NULL OR last_renewed_at IS NULL;
    `);
    await queryRunner.query(`CREATE INDEX ix_ai_job_leases_owner_node ON ai_job_leases(owner_node);`);

    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`DROP TABLE IF EXISTS sandbox_command_policy_decisions;`);
    await queryRunner.query(`DROP TABLE IF EXISTS sandbox_run_policy_bindings;`);
    await queryRunner.query(`DROP TABLE IF EXISTS policy_versions;`);
    await queryRunner.query(`DROP TABLE IF EXISTS policy_definitions;`);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }
}

