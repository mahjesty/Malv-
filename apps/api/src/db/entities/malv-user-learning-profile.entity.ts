import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from "typeorm";

/** Rolling behavioral aggregates only — no message text. */
export type MalvUserLearningProfilePayload = {
  turns: number;
  tierUpgrade12: number;
  tierDowngrade21: number;
  refinementTriggered: number;
  driftSignals: number;
  lowResponseConf: number;
  clarificationReplies: number;
  userCorrectionHeuristic: number;
  userReask: number;
  clarificationLoop: number;
  executionMismatch: number;
  failurePatternCounts: Record<string, number>;
};

export function createEmptyMalvUserLearningProfilePayload(): MalvUserLearningProfilePayload {
  return {
    turns: 0,
    tierUpgrade12: 0,
    tierDowngrade21: 0,
    refinementTriggered: 0,
    driftSignals: 0,
    lowResponseConf: 0,
    clarificationReplies: 0,
    userCorrectionHeuristic: 0,
    userReask: 0,
    clarificationLoop: 0,
    executionMismatch: 0,
    failurePatternCounts: {}
  };
}

@Entity({ name: "malv_user_learning_profile" })
export class MalvUserLearningProfileEntity {
  @PrimaryColumn({ type: "char", length: 36, name: "user_id" })
  userId!: string;

  @Column({ type: "json", name: "payload_json" })
  payloadJson!: MalvUserLearningProfilePayload;

  @Index()
  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
