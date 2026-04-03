import { Controller, Get, Headers, HttpException, HttpStatus } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InferenceConfigService } from "./inference-config.service";

@Controller("v1/internal")
export class InferenceInternalController {
  constructor(private readonly cfg: ConfigService, private readonly inferenceConfig: InferenceConfigService) {}

  @Get("inference/settings/effective")
  async getEffectiveInferenceSettingsForWorker(@Headers("x-api-key") xApiKey?: string) {
    const workerKey = this.cfg.get<string>("BEAST_WORKER_API_KEY") ?? "";
    if (!workerKey) {
      throw new HttpException("Worker API key not configured", HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (workerKey !== (xApiKey ?? "")) {
      throw new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED);
    }
    return this.inferenceConfig.getWorkerConfigPayload();
  }
}

