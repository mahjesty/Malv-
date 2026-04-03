import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Milestone 1 — room-based collaboration: shared conversation thread, room-scoped files & memory.
 */
export class CollaborationRoomThreadFilesMemory0271775100000000 implements MigrationInterface {
  name = "CollaborationRoomThreadFilesMemory0271775100000000";

  private async currentDb(queryRunner: QueryRunner): Promise<string> {
    const rows = await queryRunner.query(`SELECT DATABASE() AS db`);
    const db = rows[0]?.db as string | undefined;
    if (!db) throw new Error("CollaborationRoomThread027: no database selected");
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

  private async fkExists(queryRunner: QueryRunner, db: string, table: string, constraintName: string): Promise<boolean> {
    const r = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
      [db, table, constraintName]
    );
    return Number(r[0]?.c) > 0;
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    const db = await this.currentDb(queryRunner);

    if (!(await this.columnExists(queryRunner, db, "collaboration_rooms", "conversation_id"))) {
      await queryRunner.query(`ALTER TABLE collaboration_rooms ADD COLUMN conversation_id CHAR(36) NULL`);
    }
    if (!(await this.fkExists(queryRunner, db, "collaboration_rooms", "fk_collaboration_rooms_conversation"))) {
      await queryRunner.query(
        `ALTER TABLE collaboration_rooms ADD CONSTRAINT fk_collaboration_rooms_conversation
         FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL`
      );
    }
    const ixConv = "uq_collaboration_rooms_conversation_id";
    const ixRows = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'collaboration_rooms' AND INDEX_NAME = ?`,
      [db, ixConv]
    );
    if (Number(ixRows[0]?.c) === 0) {
      await queryRunner.query(`CREATE UNIQUE INDEX ${ixConv} ON collaboration_rooms(conversation_id)`);
    }

    if (!(await this.columnExists(queryRunner, db, "memory_entries", "collaboration_room_id"))) {
      await queryRunner.query(`ALTER TABLE memory_entries ADD COLUMN collaboration_room_id CHAR(36) NULL`);
    }
    const ixMemRoom = "ix_memory_entries_collaboration_room_id";
    const ixMemRows = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'memory_entries' AND INDEX_NAME = ?`,
      [db, ixMemRoom]
    );
    if (Number(ixMemRows[0]?.c) === 0) {
      await queryRunner.query(`CREATE INDEX ${ixMemRoom} ON memory_entries(collaboration_room_id)`);
    }
    if (!(await this.fkExists(queryRunner, db, "memory_entries", "fk_memory_entries_collaboration_room"))) {
      await queryRunner.query(
        `ALTER TABLE memory_entries ADD CONSTRAINT fk_memory_entries_collaboration_room
         FOREIGN KEY (collaboration_room_id) REFERENCES collaboration_rooms(id) ON DELETE SET NULL`
      );
    }

    if (!(await this.columnExists(queryRunner, db, "files", "collaboration_room_id"))) {
      await queryRunner.query(`ALTER TABLE files ADD COLUMN collaboration_room_id CHAR(36) NULL`);
    }
    const ixFileRoom = "ix_files_collaboration_room_id";
    const ixFileRows = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'files' AND INDEX_NAME = ?`,
      [db, ixFileRoom]
    );
    if (Number(ixFileRows[0]?.c) === 0) {
      await queryRunner.query(`CREATE INDEX ${ixFileRoom} ON files(collaboration_room_id)`);
    }
    if (!(await this.fkExists(queryRunner, db, "files", "fk_files_collaboration_room"))) {
      await queryRunner.query(
        `ALTER TABLE files ADD CONSTRAINT fk_files_collaboration_room
         FOREIGN KEY (collaboration_room_id) REFERENCES collaboration_rooms(id) ON DELETE SET NULL`
      );
    }
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    /* Non-destructive */
  }
}
