import { Injectable } from "@nestjs/common";
import { shapeMalvFinalResponse, type ShapeMalvFinalResponseInput } from "./malv-response-shaping-layer.util";

@Injectable()
export class MalvResponseShapingLayerService {
  shape(args: ShapeMalvFinalResponseInput): string {
    return shapeMalvFinalResponse(args);
  }
}
