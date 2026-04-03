import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import { MalvControlledConfigEntity } from "../db/entities/malv-controlled-config.entity";

function isMissingControlledConfigTable(err: unknown): boolean {
  if (!(err instanceof QueryFailedError)) return false;
  const de = (err as QueryFailedError & { driverError?: { errno?: number } }).driverError;
  if (de?.errno === 1146) return true;
  return /malv_controlled_config/i.test(String(err.message)) && /doesn't exist/i.test(String(err.message));
}

export const BRAIN_PROMPT_DIRECTIVE_EXTRA_KEY = "brain.prompt.directive_extra";

@Injectable()
export class MalvControlledConfigService {
  private readonly log = new Logger(MalvControlledConfigService.name);

  constructor(@InjectRepository(MalvControlledConfigEntity) private readonly repo: Repository<MalvControlledConfigEntity>) {}

  async getDirectiveExtraText(): Promise<string> {
    try {
      const row = await this.repo.findOne({ where: { configKey: BRAIN_PROMPT_DIRECTIVE_EXTRA_KEY } });
      const v = row?.valueJson as { text?: string } | undefined;
      return (v?.text ?? "").trim();
    } catch (e) {
      if (isMissingControlledConfigTable(e)) {
        this.log.warn(
          "malv_controlled_config missing; run `npm run migration:run -w @malv/api`. Continuing without directive extra."
        );
        return "";
      }
      throw e;
    }
  }

  async upsertJson(configKey: string, valueJson: Record<string, unknown>): Promise<void> {
    const existing = await this.repo.findOne({ where: { configKey } });
    if (existing) {
      existing.valueJson = valueJson;
      await this.repo.save(existing);
      return;
    }
    await this.repo.save(
      this.repo.create({
        configKey,
        valueJson
      })
    );
  }
}
