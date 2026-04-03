import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateWorkspaceRuntimeSessions20260402000100 implements MigrationInterface {
  name = "CreateWorkspaceRuntimeSessions20260402000100";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`workspace_runtime_sessions\` (
        \`id\` varchar(36) NOT NULL,
        \`source_type\` varchar(20) NOT NULL,
        \`source_id\` varchar(64) NOT NULL,
        \`status\` varchar(24) NOT NULL DEFAULT 'idle',
        \`active_run_id\` varchar(36) NULL,
        \`last_event_at\` datetime NULL,
        \`metadata\` json NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`user_id\` varchar(36) NULL,
        INDEX \`IDX_workspace_runtime_sessions_user\` (\`user_id\`),
        INDEX \`ix_workspace_runtime_sessions_source\` (\`source_type\`, \`source_id\`),
        INDEX \`IDX_workspace_runtime_sessions_status\` (\`status\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      ALTER TABLE \`workspace_runtime_sessions\`
      ADD CONSTRAINT \`FK_workspace_runtime_sessions_user\`
      FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`workspace_runtime_sessions\`
      DROP FOREIGN KEY \`FK_workspace_runtime_sessions_user\`
    `);
    await queryRunner.query("DROP TABLE `workspace_runtime_sessions`");
  }
}

