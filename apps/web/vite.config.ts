import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import autoprefixer from "autoprefixer";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = dirname(fileURLToPath(import.meta.url));
const exploreActionHandoffSrc = resolve(
  __dirname,
  "../../packages/explore-action-handoff/src/index.ts"
);

export default defineConfig({
  css: {
    postcss: {
      plugins: [autoprefixer()]
    }
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      /**
       * The handoff package ships CommonJS from `tsc` only. Vite/Rollup cannot reliably
       * re-export named bindings like `ExploreActionIntent` from that output, which breaks
       * `vite build` and can surface as a blank app when the graph fails to evaluate.
       * Resolve to TS source here so the web bundle gets standard ESM analysis.
       * (Node API still uses `dist/` via its own resolution.)
       */
      "@malv/explore-action-handoff": exploreActionHandoffSrc
    }
  },
  server: {
    port: 5173
  }
});

