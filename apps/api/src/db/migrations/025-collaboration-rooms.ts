import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 4 — collaboration: shared rooms + membership (user search in separate controller).
 */
export class CollaborationRooms0251775000000000 implements MigrationInterface {
  name = "CollaborationRooms0251775000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS collaboration_rooms (
        id CHAR(36) NOT NULL,
        owner_user_id CHAR(36) NOT NULL,
        title VARCHAR(160) NULL,
        malv_enabled TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_collaboration_rooms_owner (owner_user_id),
        CONSTRAINT fk_collaboration_rooms_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS room_members (
        id CHAR(36) NOT NULL,
        room_id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        role VARCHAR(20) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_room_members_room_user (room_id, user_id),
        KEY ix_room_members_user (user_id),
        CONSTRAINT fk_room_members_room FOREIGN KEY (room_id) REFERENCES collaboration_rooms(id) ON DELETE CASCADE,
        CONSTRAINT fk_room_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`DROP TABLE IF EXISTS room_members;`);
    await queryRunner.query(`DROP TABLE IF EXISTS collaboration_rooms;`);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }
}
