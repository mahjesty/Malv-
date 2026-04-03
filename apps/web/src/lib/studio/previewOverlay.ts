export type SemanticRegion =
  | "hero"
  | "nav"
  | "section"
  | "card_group"
  | "form"
  | "footer"
  | "content_block"
  | "unknown";

export type OverlayRect = { left: number; top: number; width: number; height: number };

export function classifySemanticRegion(args: {
  tagName?: string | null;
  role?: string | null;
  id?: string | null;
  className?: string | null;
  dataset?: Record<string, string | undefined>;
}): SemanticRegion {
  const tag = String(args.tagName ?? "").toLowerCase();
  const role = String(args.role ?? "").toLowerCase();
  const id = String(args.id ?? "").toLowerCase();
  const cls = String(args.className ?? "").toLowerCase();
  const tokens = `${tag} ${role} ${id} ${cls} ${Object.keys(args.dataset ?? {}).join(" ").toLowerCase()}`;
  if (/hero|banner/.test(tokens)) return "hero";
  if (tag === "nav" || role === "navigation" || /navbar|nav/.test(tokens)) return "nav";
  if (tag === "footer" || role === "contentinfo" || /footer/.test(tokens)) return "footer";
  if (tag === "form" || /form|input/.test(tokens)) return "form";
  if (/card|pricing|grid/.test(tokens)) return "card_group";
  if (tag === "section" || /section/.test(tokens)) return "section";
  if (tag === "article" || tag === "main" || /content|body|copy/.test(tokens)) return "content_block";
  return "unknown";
}

export function computeOverlayRect(targetRect: DOMRect, containerRect: DOMRect): OverlayRect | null {
  const width = Math.max(0, targetRect.width);
  const height = Math.max(0, targetRect.height);
  if (width < 2 || height < 2) return null;
  return {
    left: Math.max(0, targetRect.left - containerRect.left),
    top: Math.max(0, targetRect.top - containerRect.top),
    width,
    height
  };
}

