import type { MigrationInterface, QueryRunner } from "typeorm";

export class MalvStudioSessions0391785000000000 implements MigrationInterface {
  name = "MalvStudioSessions0391785000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE malv_studio_sessions (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        workspace_id CHAR(36) NULL,
        title VARCHAR(160) NOT NULL DEFAULT 'MALV Studio Session',
        status VARCHAR(40) NOT NULL DEFAULT 'active',
        selected_target JSON NULL,
        preview_context JSON NULL,
        pending_change_summary JSON NULL,
        versions JSON NULL,
        last_sandbox_run_id VARCHAR(36) NULL,
        last_patch_proposal_id VARCHAR(36) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        INDEX ix_malv_studio_sessions_user (user_id),
        INDEX ix_malv_studio_sessions_workspace (workspace_id),
        CONSTRAINT fk_malv_studio_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_malv_studio_sessions_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE malv_studio_sessions;`);
  }
}
