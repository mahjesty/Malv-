import { BadRequestException, Injectable } from "@nestjs/common";
import { ImprovementProposalEntity } from "../db/entities/improvement-proposal.entity";
import { MalvControlledConfigService, BRAIN_PROMPT_DIRECTIVE_EXTRA_KEY } from "./malv-controlled-config.service";

@Injectable()
export class ImprovementApplicationService {
  constructor(private readonly controlled: MalvControlledConfigService) {}

  /**
   * Applies only whitelisted suggestion shapes. Called after admin approval.
   */
  async applyApprovedProposal(proposal: ImprovementProposalEntity): Promise<void> {
    const s = proposal.suggestion ?? {};
    const kind = s.kind as string | undefined;

    if (kind === "prompt_tweak" || kind === "prompt_directive_extra") {
      const key = (s.configKey as string) || BRAIN_PROMPT_DIRECTIVE_EXTRA_KEY;
      const value = (s.value as Record<string, unknown>) ?? {};
      if (typeof (value as { text?: unknown }).text !== "string") {
        throw new BadRequestException("Suggestion value.text must be a string for prompt tweaks.");
      }
      await this.controlled.upsertJson(key, value);
      return;
    }

    if (kind === "config_review" || kind === "ops_review") {
      throw new BadRequestException("This proposal type requires manual ops review — no automatic config apply.");
    }

    throw new BadRequestException("Unsupported or unsafe suggestion kind for automatic apply.");
  }
}
