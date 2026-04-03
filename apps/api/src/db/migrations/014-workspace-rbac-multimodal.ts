import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceRbacMultimodal0141774400000000 implements MigrationInterface {
  name = "WorkspaceRbacMultimodal0141774400000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id CHAR(36) NOT NULL,
        name VARCHAR(160) NOT NULL,
        slug VARCHAR(160) NOT NULL,
        owner_user_id CHAR(36) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_workspaces_slug (slug),
        KEY ix_workspaces_owner_user_id (owner_user_id),
        CONSTRAINT fk_workspaces_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspace_roles (
        id CHAR(36) NOT NULL,
        workspace_id CHAR(36) NOT NULL,
        role_key VARCHAR(40) NOT NULL,
        display_name VARCHAR(120) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_workspace_roles_ws_key (workspace_id, role_key),
        KEY ix_workspace_roles_workspace_id (workspace_id),
        CONSTRAINT fk_workspace_roles_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspace_user_roles (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        workspace_id CHAR(36) NOT NULL,
        workspace_role_id CHAR(36) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_workspace_user_roles_user_ws (user_id, workspace_id),
        KEY ix_workspace_user_roles_workspace_id (workspace_id),
        KEY ix_workspace_user_roles_workspace_role_id (workspace_role_id),
        CONSTRAINT fk_workspace_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_workspace_user_roles_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        CONSTRAINT fk_workspace_user_roles_role FOREIGN KEY (workspace_role_id) REFERENCES workspace_roles(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspace_role_permissions (
        id CHAR(36) NOT NULL,
        workspace_role_id CHAR(36) NOT NULL,
        permission_id CHAR(36) NOT NULL,
        granted TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_wrperm_role_perm (workspace_role_id, permission_id),
        KEY ix_wrperm_permission_id (permission_id),
        CONSTRAINT fk_wrperm_workspace_role FOREIGN KEY (workspace_role_id) REFERENCES workspace_roles(id) ON DELETE CASCADE,
        CONSTRAINT fk_wrperm_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS multimodal_extractions (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        file_id CHAR(36) NOT NULL,
        workspace_id CHAR(36) NULL,
        ai_job_id CHAR(36) NULL,
        modality VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'queued',
        unified_result JSON NULL,
        retrieval_text LONGTEXT NULL,
        sections_json JSON NULL,
        page_meta_json JSON NULL,
        tables_figures_json JSON NULL,
        segment_meta_json JSON NULL,
        image_analysis_json JSON NULL,
        processor_version VARCHAR(120) NULL,
        error_message TEXT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY ix_multimodal_extractions_user_id (user_id),
        KEY ix_multimodal_extractions_file_id (file_id),
        KEY ix_multimodal_extractions_workspace_id (workspace_id),
        KEY ix_multimodal_extractions_ai_job_id (ai_job_id),
        KEY ix_multimodal_extractions_status (status),
        CONSTRAINT fk_multimodal_extractions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_multimodal_extractions_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
        CONSTRAINT fk_multimodal_extractions_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL,
        CONSTRAINT fk_multimodal_extractions_ai_job FOREIGN KEY (ai_job_id) REFERENCES ai_jobs(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      ALTER TABLE sandbox_runs
      ADD COLUMN workspace_id CHAR(36) NULL,
      ADD KEY ix_sandbox_runs_workspace_id (workspace_id),
      ADD CONSTRAINT fk_sandbox_runs_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE files
      ADD COLUMN workspace_id CHAR(36) NULL,
      ADD KEY ix_files_workspace_id (workspace_id),
      ADD CONSTRAINT fk_files_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE review_sessions
      ADD COLUMN workspace_id CHAR(36) NULL,
      ADD KEY ix_review_sessions_workspace_id (workspace_id),
      ADD CONSTRAINT fk_review_sessions_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE operator_targets
      ADD COLUMN workspace_id CHAR(36) NULL,
      ADD KEY ix_operator_targets_workspace_id (workspace_id),
      ADD CONSTRAINT fk_operator_targets_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      INSERT INTO permissions (id, permission_key, permission_name, description, is_active, created_at)
      SELECT UUID(), t.permission_key, t.permission_name, t.description, 1, CURRENT_TIMESTAMP(3)
      FROM (
        SELECT 'workspace.member.read' AS permission_key, 'Workspace member read' AS permission_name, 'View workspace membership and metadata' AS description
        UNION ALL SELECT 'workspace.sandbox.execute', 'Workspace sandbox execute', 'Run sandbox/operator work in workspace'
        UNION ALL SELECT 'workspace.review.create', 'Workspace review create', 'Create review sessions in workspace'
        UNION ALL SELECT 'workspace.operator.dispatch', 'Workspace operator dispatch', 'Dispatch voice/operator actions in workspace'
        UNION ALL SELECT 'workspace.files.read', 'Workspace files read', 'Read workspace-scoped files'
        UNION ALL SELECT 'workspace.files.write', 'Workspace files write', 'Register or mutate workspace-scoped files'
        UNION ALL SELECT 'workspace.admin.manage', 'Workspace admin manage', 'Manage workspace roles and membership'
      ) AS t
      WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.permission_key = t.permission_key);
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (id, role_id, permission_id, granted, created_at)
      SELECT UUID(), r.id, p.id, 1, CURRENT_TIMESTAMP(3)
      FROM roles r
      JOIN permissions p ON p.permission_key LIKE 'workspace.%'
      WHERE r.role_key = 'admin'
      AND NOT EXISTS (
        SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
      );
    `);

    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`ALTER TABLE operator_targets DROP FOREIGN KEY fk_operator_targets_workspace, DROP COLUMN workspace_id;`);
    await queryRunner.query(`ALTER TABLE review_sessions DROP FOREIGN KEY fk_review_sessions_workspace, DROP COLUMN workspace_id;`);
    await queryRunner.query(`ALTER TABLE files DROP FOREIGN KEY fk_files_workspace, DROP COLUMN workspace_id;`);
    await queryRunner.query(`ALTER TABLE sandbox_runs DROP FOREIGN KEY fk_sandbox_runs_workspace, DROP COLUMN workspace_id;`);
    await queryRunner.query(`DROP TABLE IF EXISTS multimodal_extractions;`);
    await queryRunner.query(`DROP TABLE IF EXISTS workspace_role_permissions;`);
    await queryRunner.query(`DROP TABLE IF EXISTS workspace_user_roles;`);
    await queryRunner.query(`DROP TABLE IF EXISTS workspace_roles;`);
    await queryRunner.query(`DROP TABLE IF EXISTS workspaces;`);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }
}
