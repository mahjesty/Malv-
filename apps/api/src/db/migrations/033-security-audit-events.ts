import { MigrationInterface, QueryRunner } from "typeorm";

export class SecurityAuditEvents0331776000000001 implements MigrationInterface {
  name = "SecurityAuditEvents0331776000000001";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS security_audit_events (
        id CHAR(36) NOT NULL,
        event_type VARCHAR(120) NOT NULL,
        severity VARCHAR(16) NOT NULL DEFAULT 'medium',
        actor_user_id CHAR(36) NULL,
        actor_role VARCHAR(32) NULL,
        source_ip VARCHAR(64) NULL,
        subsystem VARCHAR(64) NOT NULL,
        summary TEXT NOT NULL,
        details_json JSON NULL,
        correlation_id VARCHAR(64) NULL,
        occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY ix_sec_audit_event_type (event_type),
        KEY ix_sec_audit_severity (severity),
        KEY ix_sec_audit_subsystem (subsystem),
        KEY ix_sec_audit_correlation (correlation_id),
        KEY ix_sec_audit_occurred (occurred_at),
        CONSTRAINT fk_sec_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`DROP TABLE IF EXISTS security_audit_events;`);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }
}
