import { Injectable } from "@nestjs/common";

export type IntentPhase = {
  type: string;
  description: string;
  requiresApproval: boolean;
  dependencies?: string[];
  order?: number;
};

export type IntentDecomposition = {
  intent: string;
  phases: IntentPhase[];
};

@Injectable()
export class IntentDecompositionService {
  decompose(request: string): IntentDecomposition {
    const text = (request ?? "").toLowerCase();
    const intent = this.detectIntent(text);
    const phases: IntentPhase[] = [
      { type: "research_phase", description: "Gather context and clarify constraints.", requiresApproval: false, order: 1 },
      { type: "planning_phase", description: "Structure additive advisory plan.", requiresApproval: false, dependencies: ["research_phase"], order: 2 }
    ];

    if (/\bdebug\b|\berror\b|\bfail\b/.test(text)) {
      phases.push({ type: "execution_prep_phase", description: "Inspect likely failure surface.", requiresApproval: false, dependencies: ["planning_phase"], order: 3 });
      phases.push({ type: "execution_phase", description: "Prepare safe fix proposal only (advisory, no execution).", requiresApproval: true, dependencies: ["execution_prep_phase"], order: 4 });
    } else if (/\bbuild\b|\bimplement\b|\bcreate\b|\badd\b/.test(text)) {
      phases.push({ type: "execution_prep_phase", description: "Draft additive implementation preparation.", requiresApproval: false, dependencies: ["planning_phase"], order: 3 });
      phases.push({ type: "execution_phase", description: "Provide execution-ready advisory plan only.", requiresApproval: true, dependencies: ["execution_prep_phase"], order: 4 });
    } else if (/\bexecute\b|\brun\b|\bopen\b|\bsend\b|\bturn on\b|\bturn off\b/.test(text)) {
      phases.push({ type: "execution_prep_phase", description: "Classify target and risk.", requiresApproval: false, dependencies: ["planning_phase"], order: 3 });
      phases.push({ type: "execution_phase", description: "Route through approval/policy and provide sandboxed advisory plan only.", requiresApproval: true, dependencies: ["execution_prep_phase"], order: 4 });
    } else {
      phases.push({ type: "execution_prep_phase", description: "Prepare concise response strategy.", requiresApproval: false, dependencies: ["planning_phase"], order: 3 });
    }

    return { intent, phases: phases.sort((a, b) => (a.order ?? 999) - (b.order ?? 999)) };
  }

  private detectIntent(text: string): string {
    if (/\bdebug\b|\berror\b|\bfail\b/.test(text)) return "debug";
    if (/\bbuild\b|\bimplement\b|\bcreate\b|\badd\b/.test(text)) return "build";
    if (/\bexecute\b|\brun\b|\bopen\b|\bsend\b|\bturn on\b|\bturn off\b/.test(text)) return "execute";
    if (/\bexplain\b|\bwhy\b|\bhow\b/.test(text)) return "explain";
    return "general_assistance";
  }
}
