import { existsSync } from "node:fs";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { MalvVoiceCatalogEntry } from "./voice-catalog.types";

/**
 * TTS voice catalog — separate from LLM inference. Sources: MALV_VOICE_CATALOG_JSON, optional legacy PIPER_MODEL default.
 */
@Injectable()
export class VoiceCatalogService {
  private readonly logger = new Logger(VoiceCatalogService.name);

  constructor(private readonly cfg: ConfigService) {}

  /**
   * Voices that are valid in this process (enabled + piper path present when checkPaths is true).
   */
  listVoices(checkPaths = false): MalvVoiceCatalogEntry[] {
    const raw = (this.cfg.get<string>("MALV_VOICE_CATALOG_JSON") ?? process.env.MALV_VOICE_CATALOG_JSON ?? "").trim();
    const parsed: MalvVoiceCatalogEntry[] = [];
    if (raw) {
      try {
        const j = JSON.parse(raw) as unknown;
        if (Array.isArray(j)) {
          for (const item of j) {
            if (!item || typeof item !== "object") continue;
            const o = item as Record<string, unknown>;
            const id = typeof o.id === "string" ? o.id.trim() : "";
            const displayName = typeof o.displayName === "string" ? o.displayName.trim() : "";
            const piperModelPath = typeof o.piperModelPath === "string" ? o.piperModelPath.trim() : "";
            const provider = o.provider === "piper" ? "piper" : "piper";
            if (!id || !displayName || !piperModelPath) continue;
            parsed.push({
              id,
              displayName,
              provider,
              piperModelPath,
              enabled: o.enabled !== false,
              language: typeof o.language === "string" ? o.language : undefined,
              locale: typeof o.locale === "string" ? o.locale : undefined,
              personaTags: Array.isArray(o.personaTags)
                ? o.personaTags.filter((t): t is string => typeof t === "string")
                : undefined
            });
          }
        }
      } catch (e) {
        this.logger.warn(`MALV_VOICE_CATALOG_JSON parse failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const legacyModel = (this.cfg.get<string>("PIPER_MODEL") ?? process.env.PIPER_MODEL ?? "").trim();
    if (parsed.length === 0 && legacyModel) {
      parsed.push({
        id: "malv-default",
        displayName: "Default",
        provider: "piper",
        piperModelPath: legacyModel,
        enabled: true
      });
    }

    return parsed.filter((v) => {
      if (v.enabled === false) return false;
      if (!checkPaths) return true;
      try {
        return existsSync(v.piperModelPath);
      } catch {
        return false;
      }
    });
  }

  defaultVoiceId(): string {
    const explicit = (this.cfg.get<string>("MALV_DEFAULT_VOICE_ID") ?? process.env.MALV_DEFAULT_VOICE_ID ?? "").trim();
    if (explicit) return explicit;
    const voices = this.listVoices(false);
    const first = voices.find((v) => v.enabled !== false);
    return first?.id ?? "malv-default";
  }

  /**
   * Resolve Piper model path for TTS. Throws if voice unknown or catalog empty without PIPER_MODEL.
   */
  resolvePiperVoice(voiceId?: string | null): { voiceId: string; modelPath: string; displayName: string } {
    const voices = this.listVoices(false);
    const id = (voiceId ?? "").trim() || this.defaultVoiceId();
    const hit = voices.find((v) => v.id === id && v.enabled !== false);
    if (!hit) {
      throw new Error(`Unknown or disabled voice id: ${id}`);
    }
    return { voiceId: hit.id, modelPath: hit.piperModelPath, displayName: hit.displayName };
  }

}