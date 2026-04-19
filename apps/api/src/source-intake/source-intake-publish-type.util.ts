import type { BuildUnitType } from "../db/entities/build-unit.entity";

/**
 * When publishing from source intake without an explicit client `type`, infer a catalog type from the
 * uploaded filename. Never defaults to `ai_generated` — that label is for true AI-authored catalog items,
 * not arbitrary user uploads.
 */
export function inferDefaultPublishedBuildUnitTypeFromOriginalName(originalName: string | null | undefined): BuildUnitType {
  const base = (originalName ?? "").trim().split(/[/\\]/).pop() ?? "";
  const lower = base.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot + 1) : "";

  if (ext === "yml" || ext === "yaml") return "workflow";
  if (ext === "html" || ext === "htm") return "template";
  if (ext === "json" || ext === "lock") return "blueprint";
  if (ext === "toml") return "blueprint";
  if (["ts", "tsx", "js", "jsx", "mjs", "cjs", "vue", "svelte", "css"].includes(ext)) return "component";
  if (ext === "md" || ext === "mdx") return "template";
  if (["sh", "bash", "txt"].includes(ext)) return "component";
  return "component";
}
