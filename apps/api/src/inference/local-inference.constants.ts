/**
 * Default OpenAI-compatible base URL for local `llama-server` / llama.cpp HTTP (no trailing slash).
 * API (Nest) default HTTP port is 8080 — keep the model server on a different port to avoid clashes.
 */
export const MALV_LOCAL_LLAMA_SERVER_DEFAULT_BASE_URL = "http://127.0.0.1:8081";
