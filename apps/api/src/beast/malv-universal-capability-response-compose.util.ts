import type {
  MalvUniversalCapabilityRoute,
  MalvUniversalResponseMode
} from "./malv-universal-capability-router.util";
import type {
  MalvFinanceExecutionData,
  MalvRichActionItem,
  MalvRichMediaCard,
  MalvRichResponse,
  MalvRichSourceItem,
  MalvWebResearchExecutionData
} from "./malv-rich-response.types";
import type { MalvUniversalCapabilityExecutionResult } from "./malv-universal-capability-execution.util";
import { malvRouteSupportsSourcePillChrome } from "./malv-rich-response-chrome.util";
import type { MalvRichSurfaceDisplayPolicy } from "./malv-rich-surface-display-policy.util";
import {
  malvRichSurfaceShouldAttachSourcePreviewTiles,
  resolveMalvRichSurfaceDisplayPolicy,
  trimMalvRichMediaDeckToBudget
} from "./malv-rich-surface-display-policy.util";
import {
  filterMalvRenderableRichImages,
  filterMalvRenderableRichSources,
  liftMarkdownImagesFromAssistantBody,
  liftMarkdownLinksAndBareUrlsFromAssistantBody,
  mergeMalvRichImages,
  mergeMalvRichSources,
  sanitizeMalvRichProfessionalAssistantBody,
  validateMalvRichDeliveryComposition
} from "./malv-rich-response-body-sanitize.util";
import { curateMalvRichSurfaceStructuredContent } from "./malv-rich-surface-curation.util";

function formatFinanceLeadIn(data: MalvFinanceExecutionData): string {
  const r = data.range
    ? ` ${data.range.label} range ${data.range.low}–${data.range.high} ${data.currency}.`
    : "";
  const chg =
    data.changeAbs >= 0
      ? `up ${data.changeAbs} ${data.currency} (${data.changePct >= 0 ? "+" : ""}${data.changePct}%)`
      : `down ${Math.abs(data.changeAbs)} ${data.currency} (${data.changePct}%)`;
  return `${data.label} (${data.symbol}) last traded at ${data.current} ${data.currency} as of ${data.asOf}, ${chg}.${r}`.replace(/\s+/g, " ").trim();
}

function formatResearchLeadIn(data: MalvWebResearchExecutionData): string {
  const facts = Array.isArray(data.keyFacts) ? data.keyFacts.map((f) => String(f).trim()).filter(Boolean) : [];
  const explain = typeof data.shortExplanation === "string" ? data.shortExplanation.trim() : "";
  const merged = [facts.join(" "), explain].filter((x) => x.length > 0).join(" ");
  return merged.replace(/\s+/g, " ").trim();
}

function asFinanceSnapshot(x: unknown): MalvFinanceExecutionData | null {
  return x && typeof x === "object" && (x as MalvFinanceExecutionData).kind === "malv_finance_snapshot"
    ? (x as MalvFinanceExecutionData)
    : null;
}

function extractFinanceSnapshotFromRichData(data: unknown): MalvFinanceExecutionData | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { finance?: unknown };
  return asFinanceSnapshot(d.finance) ?? asFinanceSnapshot(data);
}

function buildMalvRichMediaDeck(args: {
  rich: MalvRichResponse;
  mode: MalvUniversalResponseMode;
  mergedSources: MalvRichSourceItem[];
  policy: MalvRichSurfaceDisplayPolicy;
  imageCardCountAfterCap: number;
}): MalvRichMediaCard[] {
  const { rich, mode, mergedSources, policy, imageCardCountAfterCap } = args;
  const cards: MalvRichMediaCard[] = [];
  if (!policy.financeMediaChartOnly) {
    for (const im of rich.images ?? []) {
      const url = typeof im.url === "string" ? im.url.trim() : "";
      if (!url) continue;
      cards.push({
        kind: "image",
        url,
        alt: typeof im.alt === "string" ? im.alt : undefined,
        source: typeof im.source === "string" ? im.source : undefined
      });
    }
  }
  const fin = extractFinanceSnapshotFromRichData(rich.data);
  if (fin?.chartSeries?.length) {
    cards.push({
      kind: "chart",
      title: `${fin.symbol} · ${fin.label}`,
      subtitle: fin.asOf,
      series: fin.chartSeries.slice(-48),
      source: "Market data"
    });
  }

  if (
    malvRichSurfaceShouldAttachSourcePreviewTiles({
      mode,
      imageCardCountAfterCap,
      structuredSourceCount: mergedSources.length,
      policy
    })
  ) {
    const n = Math.min(policy.maxSourcePreviewMedia, mergedSources.length);
    for (let i = 0; i < n; i++) {
      const s = mergedSources[i];
      if (!s) continue;
      cards.push({
        kind: "source_preview",
        title: s.title,
        url: s.url
      });
    }
  }

  return trimMalvRichMediaDeckToBudget(cards, policy.maxMediaDeckCards);
}

const INFORMATIONAL_UNIVERSAL_MODES = new Set<MalvUniversalResponseMode>([
  "web_research",
  "finance_data",
  "image_enrichment",
  "mixed_text_plus_visual",
  "mixed_text_plus_sources"
]);

function userTextSuggestsExplicitTaskHandoff(userText: string): boolean {
  const t = (userText ?? "").toLowerCase();
  if (/\b(create|open)\s+(a\s+)?task\b/.test(t)) return true;
  if (/\b(send|route)\s+(this|that|it)\s+to\s+task\b/.test(t)) return true;
  if (/\b(automat|workflow|schedule|remind\s+me|implement|deploy|integrate|execute\s+(the|this)\s+task|run\s+(the|this)\s+job)\b/.test(t))
    return true;
  return false;
}

function userTextSuggestsExploratoryResearch(userText: string): boolean {
  const t = (userText ?? "").toLowerCase();
  if (/\b(deep\s+dive|literature\s+review|primary\s+sources?|peer[- ]reviewed)\b/.test(t)) return true;
  if (/\b(compare\s+(multiple|the|two|several)|investigate\s+whether|research\s+paper)\b/.test(t)) return true;
  return false;
}

function isConciseInformationalSurfaceBody(text: string): boolean {
  const s = (text ?? "").trim();
  if (s.length > 360) return false;
  const nonEmpty = s.split("\n").filter((l) => l.trim().length > 0);
  if (nonEmpty.length > 5) return false;
  if ((s.match(/[.!?]/g) ?? []).length > 6) return false;
  return true;
}

/**
 * Adaptive quick actions: never duplicate in-app source pills with a Preview chip; avoid copy-first chips
 * unless there is no pill affordance for a single-source turn.
 */
function buildMalvRichActionDeck(args: {
  sources: MalvRichSourceItem[];
  showSourcePills: boolean;
  maxActions: number;
  routeMode: MalvUniversalResponseMode;
  userText: string;
  assistantBody: string;
}): { actions: MalvRichActionItem[]; sendToTaskSuppressedReason: string | null } {
  const { sources, showSourcePills, maxActions, routeMode, userText, assistantBody } = args;
  const out: MalvRichActionItem[] = [];

  const informational = INFORMATIONAL_UNIVERSAL_MODES.has(routeMode);
  const shortInformationalSurface =
    informational &&
    !userTextSuggestsExplicitTaskHandoff(userText) &&
    !userTextSuggestsExploratoryResearch(userText) &&
    isConciseInformationalSurfaceBody(assistantBody);
  if (shortInformationalSurface) {
    return { actions: [], sendToTaskSuppressedReason: "short_informational_surface" };
  }

  const offerSendToTask = !informational || userTextSuggestsExplicitTaskHandoff(userText);
  const sendToTaskSuppressedReason =
    informational && !userTextSuggestsExplicitTaskHandoff(userText) ? "informational_surface_default" : null;
  if (offerSendToTask) {
    out.push({ id: "send_to_task", label: "To task" });
  }
  const distinctHosts = new Set(
    sources
      .map((s) => {
        try {
          return new URL(s.url.trim()).hostname.replace(/^www\./i, "").toLowerCase();
        } catch {
          return "";
        }
      })
      .filter(Boolean)
  );
  if (out.length < maxActions && sources.length >= 2 && distinctHosts.size >= 2) {
    out.push({ id: "compare_sources", label: "Compare" });
  }
  if (out.length < maxActions && !showSourcePills && sources.length === 1) {
    out.push({ id: "open_primary_source", label: "Preview", url: sources[0]?.url });
  }

  return { actions: out.slice(0, maxActions), sendToTaskSuppressedReason };
}

/**
 * After model shaping: attach `malvRichResponse`, optionally prepend a short plain-language execution lead-in
 * (charts/sources/images stay in structured chrome — not markdown scaffolding in the body).
 *
 * When {@link args.forLiveWebSocketDelivery} is true, lead-in is stored on {@link MalvRichResponse.executionLeadIn}
 * only so the reply body stays aligned with streamed worker tokens.
 */
export function composeMalvCapabilityRichDelivery(args: {
  route: MalvUniversalCapabilityRoute;
  modelReply: string;
  execution: MalvUniversalCapabilityExecutionResult;
  /** Original user message — drives contextual quick-action policy (e.g. suppress To task on informational turns). */
  userText?: string;
  /** WS live stream: do not prepend lead into `reply` — clients render `executionLeadIn` from metadata. */
  forLiveWebSocketDelivery?: boolean;
}): { reply: string; metaPatch: Record<string, unknown> } {
  const safeReply = typeof args.modelReply === "string" ? args.modelReply : "";
  try {
    return composeMalvCapabilityRichDeliveryInner(args);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      reply: safeReply,
      metaPatch: {
        malvCapabilityRichComposeOk: false,
        malvCapabilityRichComposeError: msg.slice(0, 400)
      }
    };
  }
}

function composeMalvCapabilityRichDeliveryInner(args: {
  route: MalvUniversalCapabilityRoute;
  modelReply: string;
  execution: MalvUniversalCapabilityExecutionResult;
  userText?: string;
  forLiveWebSocketDelivery?: boolean;
}): { reply: string; metaPatch: Record<string, unknown> } {
  const { route, modelReply, execution } = args;
  const userText = typeof args.userText === "string" ? args.userText : "";
  const forLiveWebSocketDelivery = args.forLiveWebSocketDelivery === true;
  const metaPatch: Record<string, unknown> = {};

  if (route.responseMode === "plain_model" || execution.skipped) {
    return { reply: modelReply, metaPatch };
  }

  if (!execution.ok || !execution.rich) {
    metaPatch.malvCapabilityExecutionOk = false;
    if (execution.error) metaPatch.malvCapabilityExecutionError = execution.error;
    return { reply: modelReply, metaPatch };
  }

  const mergeDiscoveredIntoSources = malvRouteSupportsSourcePillChrome(route.responseMode);
  const modelBody = (modelReply ?? "").trim();
  const mergeImageMarkdown =
    route.responseMode === "image_enrichment" ||
    route.responseMode === "mixed_text_plus_visual" ||
    route.responseMode === "web_research" ||
    route.responseMode === "mixed_text_plus_sources";
  const baseImages = filterMalvRenderableRichImages(execution.rich.images);
  const baseSources = filterMalvRenderableRichSources(execution.rich.sources);
  const imagePass = liftMarkdownImagesFromAssistantBody(modelBody, baseImages, {
    mergeIntoImages: mergeImageMarkdown
  });
  const mergedImages = filterMalvRenderableRichImages(mergeMalvRichImages(baseImages, imagePass.discovered));

  const liftedBody = liftMarkdownLinksAndBareUrlsFromAssistantBody(imagePass.text, baseSources, {
    mergeDiscoveredIntoSources
  });
  const mergedSourcesFull = filterMalvRenderableRichSources(mergeMalvRichSources(baseSources, liftedBody.discovered));

  const policy = resolveMalvRichSurfaceDisplayPolicy(route.responseMode, {
    structuredSourceCount: mergedSourcesFull.length
  });

  const curated = curateMalvRichSurfaceStructuredContent({
    mode: route.responseMode,
    sources: mergedSourcesFull,
    images: mergedImages,
    data: execution.rich.data,
    maxStructuredSources: policy.maxStructuredSourceItems,
    maxImageRail: policy.maxImageCardsInMediaDeck,
    userText
  });

  const cappedSources = curated.sources;
  const cappedImages = curated.images;

  const showSourcesInChrome = policy.showSourcePills && cappedSources.length > 0;

  let rich: MalvRichResponse = {
    ...execution.rich,
    images: cappedImages.length ? cappedImages : undefined,
    text: liftedBody.text,
    sources: cappedSources.length ? cappedSources : undefined,
    showSourcesInChrome
  };

  const mediaDeck = buildMalvRichMediaDeck({
    rich,
    mode: route.responseMode,
    mergedSources: cappedSources,
    policy,
    imageCardCountAfterCap: cappedImages.length
  });
  if (mediaDeck.length) {
    rich = { ...rich, media: mediaDeck };
  } else {
    const { media: _m, ...rest } = rich;
    rich = rest;
  }

  const actionDeckResult = buildMalvRichActionDeck({
    sources: cappedSources,
    showSourcePills: showSourcesInChrome,
    maxActions: policy.maxQuickActions,
    routeMode: route.responseMode,
    userText,
    assistantBody: liftedBody.text
  });
  const actionDeck = actionDeckResult.actions;
  metaPatch.malvDiagnosticRichActions = {
    sendToTaskSuppressedReason: actionDeckResult.sendToTaskSuppressedReason,
    actionDeckReducedReason: actionDeckResult.sendToTaskSuppressedReason
  };
  if (actionDeck.length) {
    rich = { ...rich, actions: actionDeck };
  } else {
    const { actions: _a, ...rest } = rich;
    rich = rest;
  }

  metaPatch.malvCapabilityExecutionOk = true;

  const data = rich.data;
  const parts: string[] = [];

  const asFinance = (x: unknown): MalvFinanceExecutionData | null =>
    x && typeof x === "object" && (x as MalvFinanceExecutionData).kind === "malv_finance_snapshot"
      ? (x as MalvFinanceExecutionData)
      : null;
  const asResearch = (x: unknown): MalvWebResearchExecutionData | null =>
    x && typeof x === "object" && (x as MalvWebResearchExecutionData).kind === "malv_web_research_bundle"
      ? (x as MalvWebResearchExecutionData)
      : null;

  if (route.responseMode === "finance_data" || route.responseMode === "mixed_text_plus_sources") {
    const nested = (data as { finance?: unknown } | undefined)?.finance;
    const fin = asFinance(nested) ?? (route.responseMode === "finance_data" ? asFinance(data) : null);
    if (fin) parts.push(formatFinanceLeadIn(fin));
  }

  if (
    route.responseMode === "web_research" ||
    route.responseMode === "mixed_text_plus_sources" ||
    route.responseMode === "mixed_text_plus_visual"
  ) {
    const nested = (data as { research?: unknown } | undefined)?.research;
    const res = asResearch(nested) ?? asResearch(data);
    if (res) parts.push(formatResearchLeadIn(res));
  }

  const lead = parts.filter((p) => p.trim().length > 0).join("\n\n");
  const body = liftedBody.text;
  let reply = body;
  if (lead) {
    reply = forLiveWebSocketDelivery ? body || "" : body ? `${lead}\n\n${body}` : lead;
  }

  const imageCardCount = cappedImages.length;
  const chartInDeck = mediaDeck.some((c) => c.kind === "chart");
  const sanitizeCtx = {
    structuredSourcesCount: cappedSources.length,
    structuredImagesCount: imageCardCount,
    hasRenderableChartInChrome: chartInDeck,
    showSourcesInChrome
  };
  reply = sanitizeMalvRichProfessionalAssistantBody(reply, sanitizeCtx);

  const validation = validateMalvRichDeliveryComposition({
    replyText: reply,
    structuredSourcesCount: cappedSources.length,
    structuredImagesCount: imageCardCount,
    showSourcesInChrome
  });
  if (!validation.ok) {
    metaPatch.malvRichBodyCompositionIssues = validation.issues;
  }

  rich = { ...rich, text: reply };
  if (forLiveWebSocketDelivery && lead.trim().length > 0) {
    rich = { ...rich, executionLeadIn: lead };
  }
  metaPatch.malvRichResponse = rich;
  metaPatch.malvStructuredRichSurface = true;

  return { reply, metaPatch };
}
