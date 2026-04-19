import { randomUUID } from "crypto";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BeastWorkerClient } from "../beast/client/beast-worker.client";
import { InferenceRoutingService } from "../inference/inference-routing.service";
import {
  inferTimeoutFromConfig,
  inferWorkerText,
  parseJsonObject
} from "../code-change-intelligence/model-readiness/beast-worker-malv-intelligence-infer.util";
import type { ImagePromptExpansionMode } from "./image-prompt-expansion.constants";
import { buildImagePromptExpansionSystemPrompt } from "./image-prompt-expansion.prompt";
import type { ImageInferredAttributes, ImageInterpretation } from "./image-intent.types";

const REFINED_PROMPT_MAX_CHARS = 6000;

@Injectable()
export class ImageIntentService {
  private readonly logger = new Logger(ImageIntentService.name);

  constructor(
    private readonly beastWorker: BeastWorkerClient,
    private readonly cfg: ConfigService,
    private readonly inferenceRouting: InferenceRoutingService
  ) {}

  /**
   * Expand short user ideas into a professional image brief + inferred metadata.
   * Uses the beast worker when available; falls back to heuristics.
   */
  async interpret(
    rawPrompt: string,
    signal?: AbortSignal,
    opts?: {
      hasSourceImage?: boolean;
      promptExpansionMode?: ImagePromptExpansionMode | null;
      /** Skip model expansion; keep brief verbatim (long in-app transform recipes). */
      skipExpansion?: boolean;
      /** Original user-visible prompt when `rawPrompt` was pre-expanded for generation. */
      originalUserPrompt?: string | null;
    }
  ): Promise<ImageInterpretation> {
    const trimmed = rawPrompt.trim();
    if (!trimmed) {
      return {
        refinedPrompt: "",
        inferred: {},
        confidence: 0
      };
    }

    const displayUser =
      typeof opts?.originalUserPrompt === "string" && opts.originalUserPrompt.trim().length > 0
        ? opts.originalUserPrompt.trim()
        : trimmed;

    if (opts?.skipExpansion) {
      const h = this.heuristicInterpret(trimmed, Boolean(opts?.hasSourceImage));
      return {
        refinedPrompt: trimmed,
        inferred: h.inferred,
        confidence: Math.max(0.55, h.confidence),
        userPrompt: displayUser
      };
    }

    const timeoutMs = inferTimeoutFromConfig((k) => this.cfg.get<string>(k), "MALV_EXPLORE_IMAGE_INTENT_TIMEOUT_MS", 25_000);

    const sourceHint = opts?.hasSourceImage
      ? "\n\n[Context: A source/reference image was supplied. This is an image-to-image or photo transformation: preserve the subject's identity, silhouette, and defining structure unless the user explicitly asks otherwise. Expand the user's brief into rich generation language without contradicting it.]"
      : "";

    const mode = opts?.promptExpansionMode ?? null;
    const systemPrompt = buildImagePromptExpansionSystemPrompt(mode);
    const userText = `${trimmed}${sourceHint}`;

    const withUser = (r: ImageInterpretation): ImageInterpretation => ({ ...r, userPrompt: displayUser });

    const route = this.inferenceRouting.decideForImageExpansion({
      surface: "image",
      rawPromptLength: trimmed.length,
      hasSourceImage: Boolean(opts?.hasSourceImage)
    });

    try {
      const reply = await inferWorkerText({
        beastWorker: this.beastWorker,
        correlationId: randomUUID(),
        systemPrompt,
        userText,
        inferTimeoutMs: timeoutMs,
        promptKey: "explore_image_prompt_expand",
        signal,
        extraContext: {
          ...route.workerContextPatch,
          malvRouting: route.telemetry
        }
      });

      if (reply) {
        const parsed = parseJsonObject(reply);
        if (parsed) {
          const fromModel = this.mapModelJson(parsed);
          if (fromModel) {
            return withUser(this.enrichWithHeuristics(fromModel, trimmed, Boolean(opts?.hasSourceImage)));
          }
        }
      }
    } catch (e) {
      this.logger.warn(`[explore-image] prompt expansion failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    return withUser(this.heuristicInterpret(trimmed, Boolean(opts?.hasSourceImage)));
  }

  private mapModelJson(o: Record<string, unknown>): ImageInterpretation | null {
    const refined =
      typeof o.refinedPrompt === "string" && o.refinedPrompt.trim().length > 0 ? o.refinedPrompt.trim() : null;
    if (!refined) return null;

    let confidence = 0.72;
    if (typeof o.confidence === "number" && Number.isFinite(o.confidence)) {
      confidence = Math.min(1, Math.max(0, o.confidence));
    }

    const inferred = this.parseInferred(o.inferred);
    return {
      refinedPrompt: refined.slice(0, REFINED_PROMPT_MAX_CHARS),
      inferred,
      confidence
    };
  }

  private parseInferred(raw: unknown): ImageInferredAttributes {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const o = raw as Record<string, unknown>;
    const out: ImageInferredAttributes = {};
    const pick = (key: keyof ImageInferredAttributes) => {
      const v = o[key];
      if (typeof v === "string" && v.trim()) out[key] = v.trim();
    };
    pick("style");
    pick("mood");
    pick("lighting");
    pick("composition");
    pick("detail");
    return out;
  }

  private enrichWithHeuristics(
    base: ImageInterpretation,
    original: string,
    hasSource: boolean
  ): ImageInterpretation {
    const h = this.heuristicInterpret(original, hasSource);
    const inferred: ImageInferredAttributes = { ...h.inferred, ...base.inferred };
    return {
      refinedPrompt: base.refinedPrompt,
      inferred,
      confidence: Math.max(base.confidence, h.confidence * 0.5)
    };
  }

  heuristicInterpret(trimmed: string, hasSource = false): ImageInterpretation {
    const lower = trimmed.toLowerCase();
    const inferred: ImageInferredAttributes = {};

    if (/\b(cinematic|film|movie|anamorphic|widescreen)\b/.test(lower)) inferred.style = "Cinematic";
    else if (/\b(anime|manga|cel shade)\b/.test(lower)) inferred.style = "Anime-inspired";
    else if (/\b(minimal|minimalist|clean flat)\b/.test(lower)) inferred.style = "Minimal";
    else if (/\b(3d|render|octane|blender|cgi)\b/.test(lower)) inferred.style = "3D render";
    else if (/\b(illustrat|watercolor|painterly)\b/.test(lower)) inferred.style = "Illustration";
    else if (/\b(editorial|magazine|lookbook)\b/.test(lower)) inferred.style = "Editorial";
    else if (/\b(product|packshot|e-?commerce|catalog)\b/.test(lower)) inferred.style = "Product photography";

    if (/\b(dramatic|high contrast|chiaroscuro|tension)\b/.test(lower)) inferred.mood = "Dramatic";
    else if (/\b(soft|gentle|calm|serene|pastel)\b/.test(lower)) inferred.mood = "Soft";
    else if (/\b(dark|noir|moody|gloomy)\b/.test(lower)) inferred.mood = "Dark";
    else if (/\b(bright|airy|high key|cheerful)\b/.test(lower)) inferred.mood = "Bright";

    if (/\b(golden hour|sunset|rim light|backlit|neon|studio light|softbox)\b/.test(lower))
      inferred.lighting = inferLightingSnippet(lower);
    if (/\b(wide shot|portrait orientation|macro|bird'?s eye|aerial|rule of thirds|centered)\b/.test(lower))
      inferred.composition = inferCompositionSnippet(lower);
    if (/\b(highly detailed|intricate|simple|low detail|minimal detail)\b/.test(lower))
      inferred.detail = /\b(highly detailed|intricate)\b/.test(lower) ? "High" : /\b(simple|low detail|minimal)\b/.test(lower) ? "Low" : "Medium";

    let refinedPrompt =
      inferred.style || inferred.mood || inferred.lighting
        ? [trimmed, "—", partsSummary(inferred)].filter(Boolean).join(" ")
        : trimmed;

    if (!hasSource && trimmed.length < 56 && refinedPrompt.length < trimmed.length + 12) {
      refinedPrompt = expandHeuristicFallback(trimmed);
    }

    return {
      refinedPrompt: refinedPrompt.slice(0, REFINED_PROMPT_MAX_CHARS),
      inferred,
      confidence: Object.keys(inferred).length > 0 ? 0.48 : 0.35
    };
  }
}

function expandHeuristicFallback(userIdea: string): string {
  const core = userIdea.trim();
  return [
    `Interpret the user's idea with visual authority: ${core}`,
    "Give the subject a clear focal read and believable presence; shape composition so hierarchy feels intentional.",
    "Describe light that models form (quality, direction, and atmosphere), surfaces with honest texture, and an environment that supports the story without visual noise.",
    "Keep mood specific to the idea—evocative but not melodramatic.",
    "Avoid watermarks, overlaid text, cluttered backgrounds, plastic skin, and accidental anatomical distortion unless the user asked for that."
  ].join(" ");
}

function inferLightingSnippet(lower: string): string {
  if (lower.includes("golden hour") || lower.includes("sunset")) return "Golden hour / warm key";
  if (lower.includes("neon")) return "Neon / colored practicals";
  if (lower.includes("rim") || lower.includes("backlit")) return "Rim / backlight";
  if (lower.includes("softbox") || lower.includes("studio")) return "Controlled studio light";
  return "Motivated natural light";
}

function inferCompositionSnippet(lower: string): string {
  if (lower.includes("wide")) return "Wide establishing";
  if (lower.includes("macro")) return "Macro / detail-forward";
  if (lower.includes("bird") || lower.includes("aerial")) return "Elevated / aerial";
  if (lower.includes("portrait orientation") || (lower.includes("portrait") && lower.includes("shot")))
    return "Vertical portrait framing";
  if (lower.includes("rule of thirds")) return "Rule of thirds";
  if (lower.includes("centered")) return "Centered subject";
  return "Balanced frame";
}

function partsSummary(inferred: ImageInferredAttributes): string {
  const bits: string[] = [];
  if (inferred.style) bits.push(inferred.style);
  if (inferred.mood) bits.push(`${inferred.mood} mood`);
  if (inferred.lighting) bits.push(inferred.lighting);
  if (inferred.composition) bits.push(inferred.composition);
  if (inferred.detail) bits.push(`${inferred.detail} detail`);
  return bits.join(", ");
}
