import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangePlanIntelligence0351778000000000 implements MigrationInterface {
  name = "ChangePlanIntelligence0351778000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE change_plans
      ADD COLUMN plan_intelligence_json JSON NULL
    `);
    await queryRunner.query(`
      ALTER TABLE change_verification_reports
      ADD COLUMN quality_json JSON NULL
    `);
    await queryRunner.query(`
      ALTER TABLE change_patch_reviews
      ADD COLUMN review_metadata_json JSON NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE change_plans
      DROP COLUMN plan_intelligence_json
    `);
    await queryRunner.query(`
      ALTER TABLE change_verification_reports
      DROP COLUMN quality_json
    `);
    await queryRunner.query(`
      ALTER TABLE change_patch_reviews
      DROP COLUMN review_metadata_json
    `);
  }
}
