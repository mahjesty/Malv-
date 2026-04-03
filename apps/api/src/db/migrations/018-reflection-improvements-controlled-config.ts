import { MigrationInterface, QueryRunner } from "typeorm";

export class ReflectionImprovementsControlledConfig0181775000000000 implements MigrationInterface {
  name = "ReflectionImprovementsControlledConfig0181775000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS reflection_events (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        correlation_id CHAR(36) NOT NULL,
        task_type VARCHAR(64) NOT NULL,
        success TINYINT(1) NOT NULL,
        latency_ms INT NOT NULL,
        error_class VARCHAR(64) NULL,
        summary TEXT NULL,
        metadata JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY ix_reflection_correlation (correlation_id),
        KEY ix_reflection_user_created (user_id, created_at),
        CONSTRAINT fk_reflection_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS improvement_proposals (
        id CHAR(36) NOT NULL,
        description TEXT NOT NULL,
        affected_system VARCHAR(64) NOT NULL,
        suggestion JSON NOT NULL,
        confidence DOUBLE NOT NULL DEFAULT 0.5,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        correlation_ids JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        decided_at DATETIME(3) NULL,
        decided_by_user_id CHAR(36) NULL,
        rejection_reason TEXT NULL,
        applied_payload JSON NULL,
        applied_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_improvement_status (status),
        CONSTRAINT fk_improvement_decider FOREIGN KEY (decided_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS malv_controlled_config (
        id CHAR(36) NOT NULL,
        config_key VARCHAR(120) NOT NULL,
        value_json JSON NOT NULL,
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_malv_controlled_key (config_key)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`DROP TABLE IF EXISTS malv_controlled_config;`);
    await queryRunner.query(`DROP TABLE IF EXISTS improvement_proposals;`);
    await queryRunner.query(`DROP TABLE IF EXISTS reflection_events;`);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }
}
