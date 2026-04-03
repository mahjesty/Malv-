import { MigrationInterface, QueryRunner } from "typeorm";

export class CallRuntimeState0211774710000000 implements MigrationInterface {
  name = "CallRuntimeState0211774710000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`
      ALTER TABLE call_sessions
      ADD COLUMN IF NOT EXISTS connection_state VARCHAR(20) NOT NULL DEFAULT 'healthy',
      ADD COLUMN IF NOT EXISTS voice_state VARCHAR(20) NOT NULL DEFAULT 'idle',
      ADD COLUMN IF NOT EXISTS mic_muted TINYINT(1) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS malv_paused TINYINT(1) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_heartbeat_at DATETIME NULL,
      ADD COLUMN IF NOT EXISTS transcript_streaming_status VARCHAR(20) NOT NULL DEFAULT 'idle',
      ADD COLUMN IF NOT EXISTS operator_activity_status VARCHAR(30) NOT NULL DEFAULT 'idle',
      ADD COLUMN IF NOT EXISTS reconnect_count INT NOT NULL DEFAULT 0;
    `);
    await queryRunner.query(`CREATE INDEX ix_call_sessions_last_heartbeat_at ON call_sessions(last_heartbeat_at);`);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=0;`);
    await queryRunner.query(`DROP INDEX ix_call_sessions_last_heartbeat_at ON call_sessions;`);
    await queryRunner.query(`
      ALTER TABLE call_sessions
      DROP COLUMN reconnect_count,
      DROP COLUMN operator_activity_status,
      DROP COLUMN transcript_streaming_status,
      DROP COLUMN last_heartbeat_at,
      DROP COLUMN malv_paused,
      DROP COLUMN mic_muted,
      DROP COLUMN voice_state,
      DROP COLUMN connection_state;
    `);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS=1;`);
  }
}
