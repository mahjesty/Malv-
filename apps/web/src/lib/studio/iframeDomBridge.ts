import { classifySemanticRegion, computeOverlayRect, type OverlayRect, type SemanticRegion } from "./previewOverlay";

export type IframeInspectability = { inspectable: boolean; reason?: string };

export type BridgeSemanticTarget = {
  signature: string;
  label: string;
  componentName: string;
  contextText: string;
  selector: string;
  region: SemanticRegion;
  overlayRect: OverlayRect;
  annotated: boolean;
  regionId?: string;
  regionType?: string;
};

type PointerResolveArgs = {
  iframe: HTMLIFrameElement | null;
  overlayContainer: HTMLElement | null;
  clientX: number;
  clientY: number;
};

const SCAN_SELECTOR = "header, nav, main, section, article, aside, footer, form, [data-region], [data-testid], [aria-label]";
const MALV_REGION_SELECTOR = "[data-malv-region], [data-malv-region-id], [data-malv-region-label], [data-malv-region-type]";
const MAX_SCAN_TARGETS = 36;
export const MALV_REGION_CONTRACT_ATTRS = [
  "data-malv-region",
  "data-malv-region-id",
  "data-malv-region-label",
  "data-malv-region-type"
] as const;

export function detectInspectableIframe(iframe: HTMLIFrameElement | null): IframeInspectability {
  if (!iframe) return { inspectable: false, reason: "iframe_unavailable" };
  try {
    const win = iframe.contentWindow;
    const doc = iframe.contentDocument ?? win?.document ?? null;
    if (!win || !doc) return { inspectable: false, reason: "iframe_document_unavailable" };
    const href = String(win.location.href ?? "");
    if (!href || href === "about:blank") return { inspectable: false, reason: "iframe_not_ready" };
    return { inspectable: true };
  } catch {
    return { inspectable: false, reason: "cross_origin_or_blocked" };
  }
}

export function semanticSignatureFromParts(args: {
  tagName?: string | null;
  role?: string | null;
  id?: string | null;
  className?: string | null;
  dataset?: Record<string, string | undefined>;
  ariaLabel?: string | null;
  malvRegionId?: string | null;
  malvRegionLabel?: string | null;
  malvRegionType?: string | null;
}): string {
  const malvRegionId = String(args.malvRegionId ?? "").trim().toLowerCase();
  const malvRegionLabel = String(args.malvRegionLabel ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .slice(0, 48);
  const malvRegionType = String(args.malvRegionType ?? "").trim().toLowerCase();
  if (malvRegionId) return `malv::id::${malvRegionId}`;
  if (malvRegionLabel) return `malv::label::${malvRegionLabel}::${malvRegionType || "region"}`;
  const tagName = String(args.tagName ?? "").toLowerCase();
  const role = String(args.role ?? "").toLowerCase();
  const id = String(args.id ?? "").trim().toLowerCase();
  const classes = String(args.className ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);
  const dataset = Object.entries(args.dataset ?? {})
    .filter(([, value]) => typeof value === "string" && value.length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 3)
    .map(([key, value]) => `${key}:${String(value).slice(0, 32).toLowerCase()}`);
  const aria = String(args.ariaLabel ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 40);
  return [tagName, role, id, classes.join("."), dataset.join("|"), aria].filter(Boolean).join("::");
}

export function isAnnotatedMalvRegion(dataset: Record<string, string | undefined>): boolean {
  return Boolean(dataset.malvRegion || dataset.malvRegionId || dataset.malvRegionLabel || dataset.malvRegionType);
}

export function preferAnnotatedTargets(targets: BridgeSemanticTarget[]): BridgeSemanticTarget[] {
  const annotated = targets.filter((target) => target.annotated);
  if (annotated.length) return annotated;
  return targets;
}

function targetFromElement(element: HTMLElement, iframeRect: DOMRect, containerRect: DOMRect): BridgeSemanticTarget | null {
  const elementRect = element.getBoundingClientRect();
  const projected = computeOverlayRect(
    {
      x: iframeRect.x + elementRect.x,
      y: iframeRect.y + elementRect.y,
      width: elementRect.width,
      height: elementRect.height,
      top: iframeRect.top + elementRect.top,
      right: iframeRect.left + elementRect.right,
      bottom: iframeRect.top + elementRect.bottom,
      left: iframeRect.left + elementRect.left,
      toJSON: () => ({})
    } as DOMRect,
    containerRect
  );
  if (!projected) return null;
  const dataset = Object.fromEntries(Object.entries(element.dataset));
  const annotated = isAnnotatedMalvRegion(dataset);
  const malvRegionLabel = element.dataset.malvRegionLabel;
  const malvRegionType = element.dataset.malvRegionType;
  const malvRegionId = element.dataset.malvRegionId;
  const region = classifySemanticRegion({
    tagName: element.tagName,
    role: element.getAttribute("role"),
    id: element.id,
    className: element.className,
    dataset
  });
  const signature = semanticSignatureFromParts({
    tagName: element.tagName,
    role: element.getAttribute("role"),
    id: element.id,
    className: element.className,
    dataset,
    ariaLabel: element.getAttribute("aria-label"),
    malvRegionId,
    malvRegionLabel,
    malvRegionType
  });
  if (!signature) return null;
  const text = (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  const componentName = (
    malvRegionType ||
    malvRegionId ||
    element.getAttribute("data-component") ||
    element.getAttribute("data-testid") ||
    element.tagName
  ).trim();
  const label = (malvRegionLabel || element.dataset.malvRegion || toRegionLabel(region)).trim();
  const regionTypeRaw = malvRegionType || (region === "unknown" ? "" : region);
  const regionType = regionTypeRaw ? regionTypeRaw.trim() : undefined;
  return {
    signature,
    selector: `sig:${signature}`,
    label,
    componentName,
    contextText: text || `${label} region`,
    region,
    overlayRect: projected,
    annotated,
    regionId: malvRegionId,
    regionType
  };
}

function toRegionLabel(region: SemanticRegion): string {
  if (region === "card_group") return "Card Group";
  if (region === "content_block") return "Content Block";
  return region.charAt(0).toUpperCase() + region.slice(1);
}

function closestMeaningfulElement(node: Element | null): HTMLElement | null {
  if (!node) return null;
  let current: Element | null = node;
  while (current && current instanceof HTMLElement) {
    if (isAnnotatedMalvRegion(Object.fromEntries(Object.entries(current.dataset)))) return current;
    const region = classifySemanticRegion({
      tagName: current.tagName,
      role: current.getAttribute("role"),
      id: current.id,
      className: current.className,
      dataset: Object.fromEntries(Object.entries(current.dataset))
    });
    if (region !== "unknown") return current;
    current = current.parentElement;
  }
  return node instanceof HTMLElement ? node : null;
}

export function resolveTargetFromPointer(args: PointerResolveArgs): BridgeSemanticTarget | null {
  const { iframe, overlayContainer, clientX, clientY } = args;
  if (!iframe || !overlayContainer) return null;
  const inspectable = detectInspectableIframe(iframe);
  if (!inspectable.inspectable) return null;
  const iframeRect = iframe.getBoundingClientRect();
  const containerRect = overlayContainer.getBoundingClientRect();
  const pointX = clientX - iframeRect.left;
  const pointY = clientY - iframeRect.top;
  try {
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document ?? null;
    if (!doc) return null;
    const raw = doc.elementFromPoint(pointX, pointY);
    const meaningful = closestMeaningfulElement(raw);
    if (!meaningful) return null;
    return targetFromElement(meaningful, iframeRect, containerRect);
  } catch {
    return null;
  }
}

export function scanIframeSemanticTargets(iframe: HTMLIFrameElement | null, overlayContainer: HTMLElement | null): BridgeSemanticTarget[] {
  if (!iframe || !overlayContainer) return [];
  const inspectable = detectInspectableIframe(iframe);
  if (!inspectable.inspectable) return [];
  try {
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document ?? null;
    if (!doc) return [];
    const iframeRect = iframe.getBoundingClientRect();
    const containerRect = overlayContainer.getBoundingClientRect();
    const annotatedNodes = Array.from(doc.querySelectorAll(MALV_REGION_SELECTOR)).filter((n): n is HTMLElement => n instanceof HTMLElement);
    const heuristicNodes = Array.from(doc.querySelectorAll(SCAN_SELECTOR)).filter((n): n is HTMLElement => n instanceof HTMLElement);
    const nodes = [...annotatedNodes, ...heuristicNodes];
    const out: BridgeSemanticTarget[] = [];
    const seen = new Set<string>();
    for (const node of nodes) {
      const target = targetFromElement(node, iframeRect, containerRect);
      if (!target) continue;
      if (target.region === "unknown") continue;
      if (seen.has(target.signature)) continue;
      seen.add(target.signature);
      out.push(target);
      if (out.length >= MAX_SCAN_TARGETS) break;
    }
    return preferAnnotatedTargets(out);
  } catch {
    return [];
  }
}

export function findTargetBySignature(
  targets: BridgeSemanticTarget[],
  signature: string | null | undefined
): BridgeSemanticTarget | null {
  if (!signature) return null;
  return targets.find((target) => target.signature === signature) ?? null;
}
