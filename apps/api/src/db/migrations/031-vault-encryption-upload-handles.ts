import { MigrationInterface, QueryRunner } from "typeorm";

export class VaultEncryptionUploadHandles0311777000000000 implements MigrationInterface {
  name = "VaultEncryptionUploadHandles0311777000000000";

  private async currentDb(queryRunner: QueryRunner): Promise<string> {
    const rows = await queryRunner.query(`SELECT DATABASE() AS db`);
    const db = rows[0]?.db as string | undefined;
    if (!db) throw new Error("Migration031: no database selected");
    return db;
  }

  private async columnExists(queryRunner: QueryRunner, db: string, table: string, column: string): Promise<boolean> {
    const r = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [db, table, column]
    );
    return Number(r[0]?.c) > 0;
  }

  private async indexExists(queryRunner: QueryRunner, db: string, table: string, indexName: string): Promise<boolean> {
    const r = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
      [db, table, indexName]
    );
    return Number(r[0]?.c) > 0;
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    const db = await this.currentDb(queryRunner);

    if (!(await this.columnExists(queryRunner, db, "vault_entries", "content_ciphertext"))) {
      await queryRunner.query(`ALTER TABLE vault_entries ADD COLUMN content_ciphertext MEDIUMTEXT NULL`);
    }
    if (!(await this.columnExists(queryRunner, db, "vault_entries", "content_iv"))) {
      await queryRunner.query(`ALTER TABLE vault_entries ADD COLUMN content_iv VARCHAR(64) NULL`);
    }
    if (!(await this.columnExists(queryRunner, db, "vault_entries", "content_tag"))) {
      await queryRunner.query(`ALTER TABLE vault_entries ADD COLUMN content_tag VARCHAR(64) NULL`);
    }
    if (!(await this.columnExists(queryRunner, db, "vault_entries", "wrapped_dek"))) {
      await queryRunner.query(`ALTER TABLE vault_entries ADD COLUMN wrapped_dek MEDIUMTEXT NULL`);
    }
    if (!(await this.columnExists(queryRunner, db, "vault_entries", "wrapped_dek_iv"))) {
      await queryRunner.query(`ALTER TABLE vault_entries ADD COLUMN wrapped_dek_iv VARCHAR(64) NULL`);
    }
    if (!(await this.columnExists(queryRunner, db, "vault_entries", "wrapped_dek_tag"))) {
      await queryRunner.query(`ALTER TABLE vault_entries ADD COLUMN wrapped_dek_tag VARCHAR(64) NULL`);
    }
    if (!(await this.columnExists(queryRunner, db, "vault_entries", "key_version"))) {
      await queryRunner.query(`ALTER TABLE vault_entries ADD COLUMN key_version INT NULL`);
    }
    if (!(await this.columnExists(queryRunner, db, "vault_entries", "encryption_alg"))) {
      await queryRunner.query(`ALTER TABLE vault_entries ADD COLUMN encryption_alg VARCHAR(40) NULL`);
    }
    if (!(await this.columnExists(queryRunner, db, "vault_entries", "encrypted_at"))) {
      await queryRunner.query(`ALTER TABLE vault_entries ADD COLUMN encrypted_at DATETIME NULL`);
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS upload_handles (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        storage_uri VARCHAR(500) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NULL,
        size_bytes BIGINT NULL,
        checksum CHAR(64) NULL,
        metadata JSON NULL,
        expires_at DATETIME NOT NULL,
        consumed_at DATETIME NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY ix_upload_handles_status (status),
        KEY ix_upload_handles_user_id (user_id),
        KEY ix_upload_handles_expires_at (expires_at),
        CONSTRAINT fk_upload_handles_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    if (!(await this.indexExists(queryRunner, db, "upload_handles", "ix_upload_handles_user_id"))) {
      await queryRunner.query(`CREATE INDEX ix_upload_handles_user_id ON upload_handles(user_id)`);
    }
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Non-destructive rollback policy.
  }
}
