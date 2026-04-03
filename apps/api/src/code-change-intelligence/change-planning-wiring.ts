import { CodeGraphService } from "./code-graph.service";
import { FrontendDesignAuditService } from "./frontend-design-audit.service";
import { DesignSystemIntelligenceService } from "./design-system-intelligence.service";
import { DesignTasteEngine } from "./design-taste-engine";
import { VisualCompositionService } from "./visual-composition.service";
import { MotionDesignService } from "./motion-design.service";
import { ChangePlanningService } from "./change-planning.service";

/** Default dependency graph for ChangePlanningService (tests and scripts). */
export function createChangePlanningService(): ChangePlanningService {
  return new ChangePlanningService(
    new CodeGraphService(),
    new FrontendDesignAuditService(),
    new DesignSystemIntelligenceService(),
    new DesignTasteEngine(),
    new VisualCompositionService(),
    new MotionDesignService()
  );
}
