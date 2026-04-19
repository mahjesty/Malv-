import { MigrationInterface, QueryRunner } from "typeorm";

export class MalvExecutorEnrollmentDeviceId05120260413140000 implements MigrationInterface {
  name = "MalvExecutorEnrollmentDeviceId05120260413140000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE malv_user_executor_enrollment
      ADD COLUMN device_id VARCHAR(128) NULL AFTER channel
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE malv_user_executor_enrollment
      DROP COLUMN device_id
    `);
  }
}
