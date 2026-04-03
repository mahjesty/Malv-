import { MigrationInterface, QueryRunner } from "typeorm";

export class PermissionsRolePerm0061774023491546 implements MigrationInterface {
  name = "PermissionsRolePerm0061774023491546";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS permissions (
        id CHAR(36) NOT NULL,
        permission_key VARCHAR(120) NOT NULL,
        permission_name VARCHAR(200) NOT NULL,
        description TEXT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_permissions_permission_key (permission_key)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        id CHAR(36) NOT NULL,
        role_id CHAR(36) NOT NULL,
        permission_id CHAR(36) NOT NULL,
        granted BOOLEAN NOT NULL DEFAULT TRUE,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_role_permissions_role_id (role_id),
        KEY ix_role_permissions_permission_id (permission_id),
        UNIQUE KEY uq_role_permissions_role_permission (role_id, permission_id),
        CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
        CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`DROP TABLE IF EXISTS role_permissions;`);
    await queryRunner.query(`DROP TABLE IF EXISTS permissions;`);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }
}

