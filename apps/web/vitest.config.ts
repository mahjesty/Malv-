import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    "import.meta.env.DEV": JSON.stringify(true),
    "import.meta.env.PROD": JSON.stringify(false),
    /** Used only by `malvChatStreamLatencyAudit` unit tests. */
    "import.meta.env.VITE_MALV_CHAT_STREAM_LATENCY_AUDIT": JSON.stringify("true")
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"]
  }
});
