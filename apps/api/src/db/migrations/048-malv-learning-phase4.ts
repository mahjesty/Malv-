import { MigrationInterface, QueryRunner } from "typeorm";

export class MalvLearningPhase41744500000000 implements MigrationInterface {
  name = "MalvLearningPhase41744500000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS malv_learning_signal (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NULL,
        event_type VARCHAR(48) NOT NULL,
        context_json JSON NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY ix_malv_learn_sig_user (user_id),
        KEY ix_malv_learn_sig_type (event_type),
        KEY ix_malv_learn_sig_created (created_at)
      ) ENGINE=InnoDB;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS malv_user_learning_profile (
        user_id CHAR(36) NOT NULL,
        payload_json JSON NOT NULL,
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (user_id),
        KEY ix_malv_user_learn_updated (updated_at)
      ) ENGINE=InnoDB;
    `);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS malv_learning_signal;`);
    await queryRunner.query(`DROP TABLE IF EXISTS malv_user_learning_profile;`);
  }
}
