import { MigrationInterface, QueryRunner } from "typeorm";

export class MemoryVault0031774022784420 implements MigrationInterface {
  name = "MemoryVault0031774022784420";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS memory_entries (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        memory_scope VARCHAR(40) NOT NULL,
        memory_type VARCHAR(60) NOT NULL DEFAULT 'note',
        title VARCHAR(160) NULL,
        content TEXT NOT NULL,
        tags JSON NULL,
        source VARCHAR(40) NOT NULL DEFAULT 'system',
        source_refs JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_memory_entries_user_id (user_id),
        KEY ix_memory_entries_scope (memory_scope),
        CONSTRAINT fk_memory_entries_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS vault_sessions (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        access_label VARCHAR(160) NULL,
        opened_at DATETIME NOT NULL,
        closed_at DATETIME NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_vault_sessions_user_id (user_id),
        CONSTRAINT fk_vault_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS vault_entries (
        id CHAR(36) NOT NULL,
        vault_session_id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        entry_type VARCHAR(40) NOT NULL DEFAULT 'note',
        label VARCHAR(160) NULL,
        content TEXT NOT NULL,
        metadata JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_vault_entries_user_id (user_id),
        KEY ix_vault_entries_session_id (vault_session_id),
        CONSTRAINT fk_vault_entries_session FOREIGN KEY (vault_session_id) REFERENCES vault_sessions(id) ON DELETE CASCADE,
        CONSTRAINT fk_vault_entries_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`DROP TABLE IF EXISTS vault_entries;`);
    await queryRunner.query(`DROP TABLE IF EXISTS vault_sessions;`);
    await queryRunner.query(`DROP TABLE IF EXISTS memory_entries;`);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }
}

