import { MigrationInterface, QueryRunner } from "typeorm";

export class SecurityIncidents0361777000000001 implements MigrationInterface {
  name = "SecurityIncidents0361777000000001";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS security_incidents (
        id CHAR(36) NOT NULL,
        title VARCHAR(512) NOT NULL,
        severity VARCHAR(16) NOT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'open',
        dedup_key VARCHAR(128) NOT NULL,
        correlation_id VARCHAR(64) NULL,
        source_subsystem VARCHAR(64) NULL,
        summary TEXT NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY ix_sec_inc_dedup (dedup_key),
        KEY ix_sec_inc_status (status),
        KEY ix_sec_inc_corr (correlation_id),
        KEY ix_sec_inc_dedup_status (dedup_key, status)
      ) ENGINE=InnoDB;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS security_incident_events (
        incident_id CHAR(36) NOT NULL,
        security_audit_event_id CHAR(36) NOT NULL,
        added_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (incident_id, security_audit_event_id),
        KEY ix_sie_event (security_audit_event_id),
        CONSTRAINT fk_sie_inc FOREIGN KEY (incident_id) REFERENCES security_incidents(id) ON DELETE CASCADE,
        CONSTRAINT fk_sie_evt FOREIGN KEY (security_audit_event_id) REFERENCES security_audit_events(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`DROP TABLE IF EXISTS security_incident_events;`);
    await queryRunner.query(`DROP TABLE IF EXISTS security_incidents;`);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }
}
