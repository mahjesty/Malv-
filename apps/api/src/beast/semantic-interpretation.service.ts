import { Injectable } from "@nestjs/common";
import { aggregateMalvSemanticInterpretation } from "./semantic-interpretation.util";
import type { MalvSemanticInterpretation, MalvSemanticInterpretationInput } from "./semantic-interpretation.types";

@Injectable()
export class SemanticInterpretationService {
  aggregate(args: MalvSemanticInterpretationInput): MalvSemanticInterpretation {
    return aggregateMalvSemanticInterpretation(args);
  }
}
