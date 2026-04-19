export type MalvVoiceProviderId = "piper";

/** One selectable TTS voice (local Piper model path). Only voices returned here are advertised. */
export type MalvVoiceCatalogEntry = {
  id: string;
  displayName: string;
  provider: MalvVoiceProviderId;
  /** Absolute or cwd-relative path to Piper `.onnx` (and optional `.onnx.json` alongside). */
  piperModelPath: string;
  enabled?: boolean;
  language?: string;
  locale?: string;
  personaTags?: string[];
};
