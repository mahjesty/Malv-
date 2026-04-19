import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import type { ImageInterpretation } from "./image-intent.types";
import { FileUnderstandingService } from "../file-understanding/file-understanding.service";
import { shouldPreserveImageBriefVerbatim } from "./image-brief-preserve.util";
import type { ImagePromptExpansionMode } from "./image-prompt-expansion.constants";
import { expandImagePromptIntelligence } from "./image-prompt-intelligence.util";
import { ImageIntentService } from "./image-intent.service";
import { MalvTaskRouterService } from "../agent-system/router/malv-task-router.service";
import { malvAgentSystemEnabled } from "../agent-system/malv-agent-system.config";

export type ImageGenerationStatus = "processing" | "done";

/** Structured pipeline result (extensible for real render backends). */
export type ImageGenerationResult = {
  status: ImageGenerationStatus;
  interpretation: ImageInterpretation;
  /** Human-readable steps for UI / audits. */
  logs: string[];
  /** Ordered execution plan (simulated until a render provider is wired). */
  plan: { steps: string[] };
  /** Short summary for cards and task bodies. */
  directionSummary: string;
  /** Populated when a real image backend returns a URL; otherwise omitted. */
  imageUrl?: string;
  /** Internal agent router summary when MALV_AGENT_SYSTEM_ENABLED is on. */
  malvAgentRouterSummary?: { workShape: string; resourceTier: string; planId: string; reasonCodes: string[] };
};

@Injectable()
export class ImageGenerationService {
  constructor(
    private readonly intent: ImageIntentService,
    private readonly files: FileUnderstandingService,
    private readonly cfg: ConfigService,
    private readonly malvTaskRouter: MalvTaskRouterService
  ) {}

  /**
   * Full pipeline: interpret → plan → simulate generation (no fake pixels).
   */
  async generate(
    rawPrompt: string,
    signal?: AbortSignal,
    opts?: {
      sourceImageDataUrl?: string | null;
      sourceImageFileId?: string | null;
      modeId?: string | null;
      userId?: string | null;
      promptExpansionMode?: ImagePromptExpansionMode | null;
    }
  ): Promise<ImageGenerationResult> {
    const logs: string[] = [];
    logs.push("Ingested creative brief");

    let malvAgentRouterSummary: ImageGenerationResult["malvAgentRouterSummary"];
    if (malvAgentSystemEnabled(this.cfg)) {
      const brief = rawPrompt.trim();
      const ar = this.malvTaskRouter.route({
        traceId: randomUUID(),
        surface: "image",
        userText: brief,
        vaultScoped: false,
        hasImageKeywords: true,
        modality: "image"
      });
      malvAgentRouterSummary = {
        workShape: ar.workShape,
        resourceTier: ar.resourceTier,
        planId: ar.plan.planId,
        reasonCodes: ar.reasonCodes.slice(0, 10)
      };
      logs.push(`MALV agent router: shape=${ar.workShape} tier=${ar.resourceTier} planSteps=${ar.plan.steps.length}`);
    }
    const fileId = opts?.sourceImageFileId?.trim() || null;
    const dataUrl = opts?.sourceImageDataUrl?.trim() || null;
    if (fileId) {
      const uid = opts?.userId?.trim();
      if (!uid) {
        throw new BadRequestException("Staged source images require an authenticated user.");
      }
      await this.files.assertUserOwnsFile(uid, fileId);
      logs.push("Source reference bound to staged upload (file id)");
    }
    const hasSource = Boolean(dataUrl) || Boolean(fileId);
    if (hasSource) {
      logs.push("Source reference image supplied for transform / img2img context");
    }
    if (opts?.modeId?.trim()) {
      logs.push(`Mode id: ${opts.modeId.trim()}`);
    }

    const trimmedPrompt = rawPrompt.trim();
    if (hasSource && !trimmedPrompt) {
      throw new BadRequestException(
        "Transform requests require a non-empty prompt (the composed style brief must be sent with the source image)."
      );
    }

    const preserveBrief = shouldPreserveImageBriefVerbatim(trimmedPrompt, hasSource);

    let workingPrompt = trimmedPrompt;
    if (!preserveBrief && trimmedPrompt.length > 0) {
      const intel = expandImagePromptIntelligence({
        rawUserPrompt: trimmedPrompt,
        modeId: opts?.modeId ?? null,
        promptExpansionMode: opts?.promptExpansionMode ?? null,
        hasSourceImage: hasSource
      });
      workingPrompt = intel.expandedPrompt;
      logs.push("Layered prompt intelligence applied (deterministic prelude)");
      if (process.env.MALV_EXPLORE_IMAGE_PROMPT_DEBUG === "1") {
        logs.push(
          `prompt_intel mode=${intel.debug.resolvedMode ?? "balanced"} src=${intel.debug.resolutionSource} expandedLen=${intel.expandedPrompt.length}`
        );
      }
    }

    const interpretation = await this.intent.interpret(workingPrompt, signal, {
      hasSourceImage: hasSource,
      promptExpansionMode: opts?.promptExpansionMode ?? null,
      skipExpansion: preserveBrief,
      originalUserPrompt: preserveBrief ? undefined : trimmedPrompt
    });
    logs.push(
      preserveBrief
        ? "Heuristic metadata only; preserved full client transform brief"
        : "Expanded prompt for image generation"
    );

    const interpretationForResult: ImageInterpretation = preserveBrief
      ? { ...interpretation, refinedPrompt: trimmedPrompt, userPrompt: trimmedPrompt }
      : interpretation.refinedPrompt.trim().length > 0
        ? interpretation
        : { ...interpretation, refinedPrompt: trimmedPrompt, userPrompt: trimmedPrompt };

    const planSteps = [
      "Normalize prompt and safety context",
      ...(hasSource ? ["Bind prompt to supplied source reference (identity / structure cues)"] : []),
      "Resolve style, mood, and lighting signals",
      "Prepare frame specification for render backend",
      "Await image provider (not configured) — returning direction only"
    ];
    logs.push(`Execution plan: ${planSteps.length} stages`);
    logs.push("Simulated generation complete — no image URL until backend is connected");

    const directionSummary =
      interpretationForResult.refinedPrompt.length > 280
        ? `${interpretationForResult.refinedPrompt.slice(0, 277)}…`
        : interpretationForResult.refinedPrompt;

    return {
      status: "done",
      interpretation: interpretationForResult,
      logs,
      plan: { steps: planSteps },
      directionSummary,
      ...(malvAgentRouterSummary ? { malvAgentRouterSummary } : {})
    };
  }
}
