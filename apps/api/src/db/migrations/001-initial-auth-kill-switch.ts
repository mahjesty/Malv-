import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialAuthKillSwitch0010011774022410387 implements MigrationInterface {
  name = "InitialAuthKillSwitch0010011774022410387";

  async up(queryRunner: QueryRunner): Promise<void> {
    // Use InnoDB for FKs.
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id CHAR(36) NOT NULL,
        role_key VARCHAR(50) NOT NULL,
        role_name VARCHAR(120) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_roles_role_key (role_key)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id CHAR(36) NOT NULL,
        email VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        display_name VARCHAR(120) NOT NULL,
        email_verified BOOLEAN NOT NULL DEFAULT FALSE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_users_email (email)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_roles (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        role_id CHAR(36) NOT NULL,
        is_primary BOOLEAN NOT NULL DEFAULT TRUE,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_user_roles_user_id (user_id),
        KEY ix_user_roles_role_id (role_id),
        CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        token_hash CHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_refresh_tokens_user_id (user_id),
        KEY ix_refresh_tokens_token_hash (token_hash),
        CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS trusted_devices (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        device_fingerprint VARCHAR(255) NOT NULL,
        device_label VARCHAR(255) NULL,
        is_trusted BOOLEAN NOT NULL DEFAULT TRUE,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_trusted_devices_user_id (user_id),
        UNIQUE KEY uq_trusted_devices_fingerprint (device_fingerprint),
        CONSTRAINT fk_trusted_devices_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        trusted_device_id CHAR(36) NULL,
        refresh_token_id CHAR(36) NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        ip_address VARCHAR(64) NULL,
        user_agent VARCHAR(255) NULL,
        expires_at DATETIME NOT NULL,
        last_seen_at DATETIME NOT NULL,
        revoked_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_sessions_user_id (user_id),
        KEY ix_sessions_trusted_device_id (trusted_device_id),
        KEY ix_sessions_refresh_token_id (refresh_token_id),
        CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_sessions_trusted_device FOREIGN KEY (trusted_device_id) REFERENCES trusted_devices(id) ON DELETE SET NULL,
        CONSTRAINT fk_sessions_refresh_token FOREIGN KEY (refresh_token_id) REFERENCES refresh_tokens(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS verification_tokens (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        token_type VARCHAR(40) NOT NULL,
        token_hash CHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        consumed_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_verification_tokens_user_id (user_id),
        KEY ix_verification_tokens_token_type (token_type),
        KEY ix_verification_tokens_token_hash (token_hash),
        CONSTRAINT fk_verification_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS kill_switch_events (
        external_event_id CHAR(36) NOT NULL,
        system_on BOOLEAN NOT NULL,
        previous_system_on BOOLEAN NOT NULL,
        reason VARCHAR(500) NOT NULL,
        actor VARCHAR(120) NOT NULL,
        occurred_at DATETIME NOT NULL,
        persisted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (external_event_id),
        KEY ix_kill_switch_events_system_on (system_on),
        KEY ix_kill_switch_events_occurred_at (occurred_at)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`DROP TABLE IF EXISTS kill_switch_events;`);
    await queryRunner.query(`DROP TABLE IF EXISTS verification_tokens;`);
    await queryRunner.query(`DROP TABLE IF EXISTS sessions;`);
    await queryRunner.query(`DROP TABLE IF EXISTS trusted_devices;`);
    await queryRunner.query(`DROP TABLE IF EXISTS refresh_tokens;`);
    await queryRunner.query(`DROP TABLE IF EXISTS user_roles;`);
    await queryRunner.query(`DROP TABLE IF EXISTS users;`);
    await queryRunner.query(`DROP TABLE IF EXISTS roles;`);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }
}

