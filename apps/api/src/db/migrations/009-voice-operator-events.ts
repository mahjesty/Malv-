import { MigrationInterface, QueryRunner } from "typeorm";

export class VoiceOperatorEvents0091774100002000 implements MigrationInterface {
  name = "VoiceOperatorEvents0091774100002000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS voice_operator_events (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        call_session_id CHAR(36) NULL,
        intent_type VARCHAR(30) NOT NULL,
        utterance_text TEXT NOT NULL,
        resolved_context JSON NULL,
        execution_plan JSON NULL,
        result_meta JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY ix_voice_operator_events_intent_type (intent_type),
        CONSTRAINT fk_voice_operator_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_voice_operator_events_call_session FOREIGN KEY (call_session_id) REFERENCES call_sessions(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`DROP TABLE IF EXISTS voice_operator_events;`);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }
}

