import { Injectable } from "@nestjs/common";
import {
  buildMalvResponsePlan,
  type BuildMalvResponsePlanInput,
  type MalvResponsePlan
} from "./malv-response-planning.util";

@Injectable()
export class MalvResponsePlanningService {
  buildPlan(args: BuildMalvResponsePlanInput): MalvResponsePlan {
    return buildMalvResponsePlan(args);
  }
}
