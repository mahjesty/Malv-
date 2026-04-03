export type InferenceBackendType = "openai_compatible" | "ollama" | "llamacpp" | "transformers" | "fallback" | "disabled";

export type InferenceFallbackPolicy = "always_allow" | "allow_on_error" | "disabled";

export type InferenceConfigSource = "env" | "db_override";

export type InferenceBackendCapability = {
  backendType: InferenceBackendType;
  supportsText: boolean;
  supportsStreaming: boolean;
  supportsMultimodalInput: boolean;
  supportsToolCalling: boolean;
  requiresBaseUrl: boolean;
  requiresModel: boolean;
  requiresApiKey: boolean;
  productionRecommended: boolean;
  notes: string;
};

export type InferenceConfigSummary = {
  enabled: boolean;
  backendType: InferenceBackendType;
  baseUrl?: string | null;
  model?: string | null;
  timeoutMs?: number | null;
  fallbackEnabled: boolean;
  fallbackBackend?: InferenceBackendType | null;
  fallbackPolicy: InferenceFallbackPolicy;
  healthCheckPath?: string | null;
  apiKeyRedacted?: string | null;
};

export type InferenceConfigSecret = {
  apiKey?: string | null;
};

export type InferenceEffectiveConfig = {
  configSource: InferenceConfigSource;
  configRevision: string;
  effective: InferenceConfigSummary & InferenceConfigSecret;
  validation: {
    ok: boolean;
    errors: string[];
  };
};

