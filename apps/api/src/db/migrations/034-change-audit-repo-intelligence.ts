import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangeAuditRepoIntelligence0341777000000000 implements MigrationInterface {
  name = "ChangeAuditRepoIntelligence0341777000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE change_audits
      ADD COLUMN repo_intelligence_json JSON NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE change_audits
      DROP COLUMN repo_intelligence_json
    `);
  }
}
