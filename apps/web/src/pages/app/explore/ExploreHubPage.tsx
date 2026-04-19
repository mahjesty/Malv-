import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowRight, ChevronDown, ChevronRight, Layers, Loader2, MessageSquare, Mic, Sparkles, Upload, Video, Zap } from "lucide-react";
import { Button } from "@malv/ui";
import { useAuth } from "../../../lib/auth/AuthContext";
import {
  fetchBuildUnits,
  fetchConversations,
  fetchWorkspaceTasks,
  type WorkspaceTask
} from "../../../lib/api/dataPlane";
import {
  EXPLORE_CATEGORIES,
  type ExploreCategoryId,
  exploreCapabilityPath,
  listHubCategoryCards,
  topExploreHubCapabilities,
  type ExploreCapabilityDefinition
} from "../../../lib/explore/exploreCapabilityRegistry";
import { routeHubIntentToExplorePath } from "../../../lib/explore/exploreIntentRoute";
import { readExploreContinue, type ExploreContinueRecord } from "../../../lib/explore/exploreContinueStorage";

/** Hero quick intents — outcome verbs; top strip holds the six flagship capabilities. */
const HERO_QUICK_ACTIONS: Array<{ label: string; to: string }> = [
  { label: "Ship in Studio", to: "/app/explore/create/reality" },
  { label: "Draft content", to: "/app/explore/create/content" },
  { label: "Fix what broke", to: "/app/explore/fix/fix-anything" },
  { label: "Explain it", to: "/app/explore/think/explain" },
  { label: "Plan today", to: "/app/explore/organize/plan-day" },
  { label: "Talk to MALV", to: "/app/explore/interact/talk" }
];

const STATIC_SUGGESTIONS: Array<{ title: string; href: string; why: string }> = [
  { title: "Tune a resume", href: "/app/explore/grow/resume", why: "Impact lines, honest scope" },
  { title: "Brand lab", href: "/app/explore/grow/brand", why: "Hypotheses to validate" },
  { title: "Remix for audience", href: "/app/explore/transform/remix", why: "Tone and structure" }
];

const CATEGORY_RAIL_ACCENT: Record<
  ExploreCategoryId,
  { bar: string; iconBg: string; iconText: string; fade: string }
> = {
  create: {
    bar: "bg-malv-f-gold/72",
    iconBg: "bg-malv-f-gold/14",
    iconText: "text-malv-f-gold",
    fade: "from-malv-f-gold/[0.06]"
  },
  transform: {
    bar: "bg-malv-f-live/68",
    iconBg: "bg-malv-f-live/12",
    iconText: "text-malv-f-live",
    fade: "from-malv-f-live/[0.05]"
  },
  fix: {
    bar: "bg-malv-f-live/55",
    iconBg: "bg-malv-f-live/10",
    iconText: "text-malv-f-live",
    fade: "from-malv-f-live/[0.04]"
  },
  think: {
    bar: "bg-malv-f-gold/50",
    iconBg: "bg-malv-f-gold/10",
    iconText: "text-malv-f-gold",
    fade: "from-malv-f-gold/[0.04]"
  },
  grow: {
    bar: "bg-malv-f-live/58",
    iconBg: "bg-malv-f-live/11",
    iconText: "text-malv-f-live",
    fade: "from-malv-f-live/[0.045]"
  },
  organize: {
    bar: "bg-white/35",
    iconBg: "bg-white/[0.08]",
    iconText: "text-malv-text/80",
    fade: "from-white/[0.04]"
  },
  interact: {
    bar: "bg-malv-f-live/75",
    iconBg: "bg-malv-f-live/14",
    iconText: "text-malv-f-live",
    fade: "from-malv-f-live/[0.06]"
  }
};

function TopCapabilityCard(props: { c: ExploreCapabilityDefinition; index: number }) {
  const { c, index } = props;
  return (
    <motion.li
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.03 * index }}
      className="w-[min(83vw,300px)] shrink-0 snap-center lg:w-auto lg:min-w-0"
    >
      <Link
        to={exploreCapabilityPath(c)}
        className="group relative flex h-full min-h-[118px] flex-col overflow-hidden rounded-xl border border-white/[0.1] bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-3 shadow-[0_12px_36px_rgba(0,0,0,0.42)] transition active:scale-[0.99] max-lg:active:bg-white/[0.05] lg:min-h-[160px] lg:rounded-2xl lg:border-white/[0.12] lg:p-5 lg:shadow-[0_20px_60px_rgba(0,0,0,0.5)] lg:hover:border-malv-f-live/30 lg:hover:from-white/[0.1]"
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-malv-f-gold/[0.08] via-transparent to-transparent opacity-80 lg:from-malv-f-gold/[0.1] lg:opacity-90" />
        <div className="relative flex flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-malv-f-gold/14 text-malv-f-gold ring-1 ring-malv-f-gold/22 lg:h-11 lg:w-11 lg:rounded-xl lg:bg-malv-f-gold/16 lg:ring-malv-f-gold/26">
              <c.icon className="h-[18px] w-[18px] lg:h-5 lg:w-5" aria-hidden />
            </span>
            <ArrowRight
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-malv-text/35 transition group-hover:translate-x-0.5 group-hover:text-malv-f-live lg:mt-1 lg:h-4 lg:w-4 lg:text-malv-text/40"
              aria-hidden
            />
          </div>
          <p className="relative mt-2 font-display text-[15px] font-semibold leading-tight tracking-tight text-malv-text lg:mt-3 lg:text-lg">{c.title}</p>
          <p className="relative mt-1 line-clamp-2 text-[11px] leading-snug text-malv-text/50 lg:mt-1.5 lg:text-[13px] lg:text-malv-text/55">
            {c.description}
          </p>
          <span className="relative mt-auto pt-2 text-[11px] font-semibold text-malv-f-live lg:pt-3 lg:text-[12px] max-lg:hidden">
            Open workspace
          </span>
        </div>
      </Link>
    </motion.li>
  );
}

function CategoryCapabilityCard(props: { c: ExploreCapabilityDefinition; accent: (typeof CATEGORY_RAIL_ACCENT)["create"] }) {
  const { c, accent } = props;
  return (
    <Link
      to={exploreCapabilityPath(c)}
      className="group flex w-[min(44vw,200px)] shrink-0 snap-start flex-col rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 transition active:scale-[0.99] max-lg:active:bg-white/[0.04] lg:w-auto lg:min-w-0 lg:max-w-none lg:rounded-xl lg:border-white/[0.07] lg:bg-white/[0.025] lg:px-3.5 lg:py-3 lg:hover:border-white/[0.14] lg:hover:bg-white/[0.04]"
    >
      <div className="flex items-center gap-2">
        <span
          className={[
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1 ring-white/[0.05] lg:h-8 lg:w-8 lg:rounded-lg lg:ring-white/[0.06]",
            accent.iconBg,
            accent.iconText
          ].join(" ")}
        >
          <c.icon className="h-3 w-3 lg:h-3.5 lg:w-3.5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight tracking-tight text-malv-text lg:text-[14px]">
          {c.title}
        </span>
        <ChevronRight
          className="h-3 w-3 shrink-0 text-malv-text/28 transition group-hover:translate-x-0.5 group-hover:text-malv-text/45 lg:h-3.5 lg:w-3.5 lg:text-malv-text/30"
          aria-hidden
        />
      </div>
      <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-malv-text/45 lg:mt-1.5 lg:text-[12px] lg:text-malv-text/48">{c.description}</p>
    </Link>
  );
}

function CategoryRail(props: { categoryId: ExploreCategoryId }) {
  const [expanded, setExpanded] = useState(false);
  const meta = EXPLORE_CATEGORIES.find((c) => c.id === props.categoryId);
  const { primary, overflow } = listHubCategoryCards(props.categoryId);
  const accent = CATEGORY_RAIL_ACCENT[props.categoryId];
  const line = meta?.hubLine ?? meta?.purpose ?? "";
  if (!meta) return null;
  const showOverflow = expanded && overflow.length > 0;
  const railCards = showOverflow ? [...primary, ...overflow] : primary;

  return (
    <section
      id={`explore-cat-${meta.id}`}
      className={[
        "relative scroll-mt-20 overflow-hidden rounded-xl border border-white/[0.05] bg-white/[0.015] py-3 pl-3 pr-0 max-lg:shadow-none lg:scroll-mt-24 lg:rounded-2xl lg:border-white/[0.06] lg:bg-white/[0.02] lg:py-5 lg:pl-4 lg:pr-5",
        "bg-gradient-to-r to-transparent",
        accent.fade
      ].join(" ")}
    >
      <span
        className={`absolute left-0 top-3 bottom-3 w-px rounded-full ${accent.bar} lg:top-5 lg:bottom-5`}
        aria-hidden
      />
      <div className="flex flex-col gap-2.5 pr-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6 lg:pr-0">
        <div className="flex min-w-0 items-start gap-2.5 pl-0.5 lg:max-w-[260px] lg:shrink-0">
          <span
            className={[
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-white/[0.06] lg:h-10 lg:w-10 lg:rounded-xl lg:ring-white/[0.08]",
              accent.iconBg,
              accent.iconText
            ].join(" ")}
          >
            <meta.icon className="h-4 w-4 lg:h-[18px] lg:w-[18px]" aria-hidden />
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 className="font-display text-base font-semibold leading-tight tracking-tight text-malv-text lg:text-xl">{meta.title}</h2>
            <p className="mt-0.5 text-[11px] leading-snug text-malv-text/45 lg:text-[12px] lg:text-malv-text/48">{line}</p>
          </div>
        </div>
        <div className="min-w-0 flex-1 lg:pr-0">
          <ul
            className={[
              "list-none touch-pan-x gap-2 overflow-x-auto scroll-smooth pb-0.5 pl-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              "flex snap-x snap-mandatory max-lg:flex lg:grid lg:snap-none lg:grid-cols-3 lg:gap-3 lg:overflow-visible lg:pb-0 lg:pl-0"
            ].join(" ")}
          >
            {railCards.map((c) => (
              <li key={`${c.categoryId}/${c.capabilityId}`} className="lg:min-w-0">
                <CategoryCapabilityCard c={c} accent={accent} />
              </li>
            ))}
          </ul>
          {overflow.length > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="mt-2 min-h-[40px] w-full py-2 text-left text-[11px] font-medium text-malv-text/42 transition hover:text-malv-text/70 lg:mt-3 lg:min-h-0 lg:w-auto lg:text-[12px] lg:text-malv-text/45"
            >
              {expanded ? "Show fewer" : `View all · ${meta.title}`}
              <span className="text-malv-text/32 lg:text-malv-text/35"> ({primary.length + overflow.length})</span>
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SurfaceLink(props: { to: string; label: string; icon: ReactNode }) {
  return (
    <Link
      to={props.to}
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] text-malv-text/50 transition hover:bg-white/[0.04] hover:text-malv-text/75"
    >
      <span className="text-malv-text/40">{props.icon}</span>
      {props.label}
    </Link>
  );
}

function SurfacePill(props: { to: string; label: string; icon: ReactNode }) {
  return (
    <Link
      to={props.to}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-[13px] font-medium text-malv-text/75 transition active:scale-[0.98] hover:border-white/[0.12] hover:bg-white/[0.05] hover:text-malv-text"
    >
      <span className="text-malv-text/45">{props.icon}</span>
      {props.label}
    </Link>
  );
}

export function ExploreHubPage() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const [intent, setIntent] = useState("");
  const [localContinue, setLocalContinue] = useState<ExploreContinueRecord[]>(() => readExploreContinue());

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") setLocalContinue(readExploreContinue());
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const recentsQuery = useQuery({
    queryKey: ["explore-hub", "recents", token ?? "anon"],
    enabled: Boolean(token),
    staleTime: 60_000,
    queryFn: async () => {
      const [conv, tasksRes, unitsRes] = await Promise.all([
        fetchConversations(token!, { limit: 6, offset: 0 }).catch(() => ({
          ok: false as const,
          items: [] as Array<{ id: string; title: string | null; mode: string; updatedAt: string }>,
          total: 0
        })),
        fetchWorkspaceTasks(token!, { limit: 8 }).catch(() => ({ ok: false as const, tasks: [] as WorkspaceTask[] })),
        fetchBuildUnits(token!, { mine: true, limit: 6 }).catch(() => ({ ok: false as const, units: [], total: 0, hasMore: false }))
      ]);
      return {
        conv,
        tasks: tasksRes.tasks ?? [],
        units: unitsRes.units ?? []
      };
    }
  });

  const suggestionRows = useMemo(() => {
    const dyn: Array<{ title: string; href: string; why: string }> = [];
    if (!token) {
      dyn.push({
        title: "Sign in",
        href: "/auth/login",
        why: "Recents from Chat, Tasks, Studio"
      });
    }
    const data = recentsQuery.data;
    if (data?.conv.items?.length) {
      const c = data.conv.items[0];
      dyn.push({
        title: c.title?.trim() || "Recent chat",
        href: `/app/chat?conversationId=${encodeURIComponent(c.id)}`,
        why: new Date(c.updatedAt).toLocaleDateString()
      });
    }
    if (data?.tasks?.length) {
      const t = pickInterestingTask(data.tasks);
      if (t) {
        dyn.push({
          title: t.title.trim() || "Task",
          href: "/app/tasks",
          why: taskStatusLabel(t.status)
        });
      }
    }
    if (data?.units?.length) {
      const u = data.units[0];
      dyn.push({
        title: u.title?.trim() || "Studio unit",
        href: `/app/studio?unitId=${encodeURIComponent(u.id)}&fromSurface=explore_hub`,
        why: "Studio"
      });
    }
    const merged = [...dyn, ...STATIC_SUGGESTIONS];
    const seen = new Set<string>();
    return merged.filter((r) => {
      const k = `${r.title}|${r.href}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 5);
  }, [recentsQuery.data, token]);

  const onIntentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = intent.trim();
    const { pathname, search } = routeHubIntentToExplorePath(raw);
    navigate({ pathname, search });
  };

  const topCaps = topExploreHubCapabilities();

  const suggestionsBody =
    token && recentsQuery.isLoading ? (
      <ul className="list-none space-y-1.5 px-2 py-2" aria-busy="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={`sk-${i}`} className="h-8 animate-pulse rounded-md bg-white/[0.04]" />
        ))}
      </ul>
    ) : (
      <ul className="list-none divide-y divide-white/[0.04]">
        {suggestionRows.map((s) => (
          <li key={`${s.href}-${s.title}`}>
            <Link
              to={s.href}
              className="flex items-center justify-between gap-2 px-3 py-2 text-[12px] leading-tight transition hover:bg-white/[0.03] lg:py-2.5 lg:text-[13px]"
            >
              <span className="min-w-0 truncate font-medium text-malv-text/75">{s.title}</span>
              <span className="shrink-0 text-[10px] text-malv-text/35 lg:text-[11px] lg:text-malv-text/38">{s.why}</span>
            </Link>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[min(38vh,320px)] max-lg:opacity-95 lg:h-[min(60vh,640px)]"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 15% 0%, rgb(var(--malv-f-gold-rgb) / 0.1), transparent 52%), radial-gradient(ellipse 55% 45% at 100% 5%, rgb(var(--malv-f-live-rgb) / 0.08), transparent 48%), radial-gradient(ellipse 50% 40% at 50% -15%, rgb(var(--malv-f-live-rgb) / 0.06), transparent 55%)"
        }}
      />

      <div className="mx-auto max-w-[1200px] px-4 pb-14 pt-5 sm:px-6 sm:pb-20 sm:pt-8 lg:px-8 lg:pt-10">
        {/* 1. Hero — compact on mobile */}
        <header className="grid items-center gap-8 lg:grid-cols-[1fr_min(380px,42%)] lg:gap-12">
          <div>
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-[9px] font-mono uppercase tracking-[0.3em] text-malv-f-gold sm:text-[10px] sm:tracking-[0.32em]"
            >
              Explore
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 }}
              className="mt-1.5 font-display text-[1.35rem] font-semibold leading-[1.12] tracking-tight text-malv-text sm:mt-2.5 sm:text-[clamp(1.65rem,4vw,2.85rem)] sm:leading-[1.08]"
            >
              What should MALV do next?
            </motion.h1>

            <motion.form
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              onSubmit={onIntentSubmit}
              className="mt-3 sm:mt-8"
            >
              <label htmlFor="explore-intent" className="sr-only">
                Describe an outcome
              </label>
              <div className="relative overflow-hidden rounded-xl border border-white/[0.1] bg-black/30 p-1 shadow-[0_10px_40px_rgba(0,0,0,0.35)] backdrop-blur-md sm:rounded-2xl sm:border-white/[0.14] sm:bg-black/25 sm:shadow-[0_28px_90px_rgba(0,0,0,0.55)] lg:backdrop-blur-xl">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-malv-f-live/[0.08] via-transparent to-transparent sm:from-malv-f-live/[0.1]" />
                <div className="relative flex flex-col gap-1.5 p-1.5 sm:flex-row sm:items-stretch sm:gap-2 sm:p-2">
                  <input
                    id="explore-intent"
                    value={intent}
                    onChange={(e) => setIntent(e.target.value)}
                    placeholder="What outcome do you want?"
                    className="min-h-[44px] flex-1 rounded-lg border border-white/[0.06] bg-black/35 px-3.5 text-[14px] leading-snug text-malv-text outline-none placeholder:text-[color:var(--malv-color-text-placeholder)] focus:border-malv-f-live/35 sm:min-h-[50px] sm:rounded-xl sm:border-transparent sm:bg-black/30 sm:px-4 sm:text-[15px] sm:focus:border-malv-f-live/42"
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    className="h-10 w-full shrink-0 rounded-lg px-5 text-[13px] sm:h-[50px] sm:w-auto sm:rounded-xl sm:text-sm md:px-6"
                  >
                    Go
                  </Button>
                </div>
              </div>
            </motion.form>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.12, duration: 0.45 }}
            className="relative mx-auto hidden w-full max-w-[380px] lg:block"
            aria-hidden
          >
            <div className="relative aspect-square max-h-[340px] rounded-[2rem] border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-transparent p-1 shadow-[0_40px_100px_rgba(0,0,0,0.45)]">
              <div className="relative flex h-full flex-col items-center justify-center overflow-hidden rounded-[1.65rem] bg-[radial-gradient(ellipse_at_50%_35%,rgb(var(--malv-f-gold-rgb)/0.18),transparent_62%),radial-gradient(ellipse_at_80%_80%,rgb(var(--malv-f-live-rgb)/0.1),transparent_50%)]">
                <div className="absolute inset-0 opacity-[0.35] [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:24px_24px]" />
                <div className="relative flex h-36 w-36 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] shadow-[0_0_80px_rgb(var(--malv-f-live-rgb)/0.2)] ring-1 ring-malv-f-gold/22">
                  <Sparkles className="h-14 w-14 text-malv-f-gold" />
                </div>
                <p className="relative mt-6 px-8 text-center font-display text-sm font-medium tracking-wide text-malv-text/55">
                  Capability control surface
                </p>
              </div>
            </div>
          </motion.div>
        </header>

        {/* 2. Quick actions — horizontal scroll on mobile */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.12 }}
          aria-label="Quick actions"
          className="mt-4 sm:mt-6"
        >
          <ul className="list-none flex scroll-smooth gap-3 py-1 pl-0 pr-1 max-sm:snap-x max-sm:snap-mandatory max-sm:overflow-x-auto max-sm:[-ms-overflow-style:none] max-sm:[scrollbar-width:none] max-sm:[&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:py-0 lg:gap-2.5">
            {HERO_QUICK_ACTIONS.map((q) => (
              <li key={q.to} className="shrink-0 snap-start">
                <Link
                  to={q.to}
                  className="inline-flex min-h-[44px] items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[13px] font-medium text-malv-text/82 transition active:scale-[0.98] hover:border-malv-f-live/22 hover:bg-white/[0.05] hover:text-malv-text sm:min-h-0 sm:px-3 sm:py-2 sm:text-[12.5px]"
                >
                  {q.label}
                </Link>
              </li>
            ))}
          </ul>
        </motion.section>

        {/* 3. Top capabilities — carousel mobile, grid desktop */}
        <section aria-labelledby="explore-top-cap" className="mt-8 sm:mt-12 lg:mt-16">
          <div className="mb-3 px-0 sm:mb-4">
            <p id="explore-top-cap" className="text-[9px] font-mono uppercase tracking-[0.24em] text-malv-text/38 sm:text-[10px] sm:tracking-[0.26em]">
              Top capabilities
            </p>
            <p className="mt-0.5 hidden text-[12px] text-malv-text/48 sm:mt-1 sm:block sm:text-[13px] sm:text-malv-text/50">
              Curated entry points — open a workspace.
            </p>
          </div>
          <ul className="list-none -mx-4 flex snap-x snap-mandatory scroll-smooth gap-3 overflow-x-auto scroll-pl-4 scroll-pr-4 px-4 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:scroll-pr-0 sm:px-0 sm:pb-1 lg:grid-cols-3 xl:grid-cols-6 xl:gap-3 [&::-webkit-scrollbar]:hidden">
            {topCaps.map((c, i) => (
              <TopCapabilityCard key={`${c.categoryId}/${c.capabilityId}`} c={c} index={i} />
            ))}
          </ul>
        </section>

        {/* 4. Category rails */}
        <section aria-labelledby="explore-by-cat" className="mt-8 space-y-3 sm:mt-12 sm:space-y-4 lg:mt-16 lg:space-y-5">
          <h2 id="explore-by-cat" className="sr-only">
            Browse by category
          </h2>
          {EXPLORE_CATEGORIES.map((cat) => (
            <CategoryRail key={cat.id} categoryId={cat.id} />
          ))}
        </section>

        {/* 5–6. Continue + utilities */}
        <footer className="mt-10 border-t border-white/[0.05] pt-6 sm:mt-14 sm:border-white/[0.06] sm:pt-10">
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
            <div>
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-malv-text/35 sm:text-[10px] sm:tracking-[0.22em] sm:text-malv-text/38">
                Continue
              </p>
              <ul className="mt-2 list-none space-y-0 sm:mt-3 sm:space-y-1">
                {localContinue.length === 0 ? (
                  <li className="rounded-md border border-dashed border-white/[0.06] px-2.5 py-2 text-[11px] leading-snug text-malv-text/40 sm:rounded-lg sm:px-3 sm:py-2.5 sm:text-[12px] sm:text-malv-text/42">
                    Opens you use on this device appear here.
                  </li>
                ) : (
                  localContinue.map((r) => (
                    <li key={r.href}>
                      <Link
                        to={r.href}
                        className="flex min-h-[44px] items-center justify-between gap-2 rounded-md px-1.5 py-1.5 text-left transition hover:bg-white/[0.03] sm:min-h-0 sm:rounded-lg sm:px-2 sm:py-2 sm:hover:border sm:hover:border-white/[0.08]"
                      >
                        <span className="min-w-0 truncate text-[12.5px] font-medium leading-tight text-malv-text/82 sm:text-[13px] sm:text-malv-text/85">
                          {r.title}
                        </span>
                        <span className="shrink-0 text-[10px] font-medium text-malv-f-live sm:text-[11px]">Resume</span>
                      </Link>
                    </li>
                  ))
                )}
              </ul>
              <Link
                to="/app/explore/import"
                className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 text-[11px] font-medium text-malv-text/45 sm:mt-4 sm:min-h-0 sm:gap-2 sm:text-[12px] sm:text-malv-text/50 sm:hover:text-malv-text/75"
              >
                <Upload className="h-3 w-3 shrink-0 text-malv-text/32 sm:h-3.5 sm:w-3.5" aria-hidden />
                Import source
                <ArrowRight className="h-3 w-3 opacity-45 sm:opacity-50" aria-hidden />
              </Link>
            </div>

            <div className="hidden lg:block">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-malv-text/38">Suggestions</p>
                {token && recentsQuery.isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-malv-text/30" aria-hidden />
                ) : null}
              </div>
              <div className="mt-3 overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.015]">{suggestionsBody}</div>
              <p className="mt-6 text-[10px] font-mono uppercase tracking-[0.2em] text-malv-text/32">Other surfaces</p>
              <div className="mt-2 flex flex-wrap gap-x-1 gap-y-0.5">
                <SurfaceLink to="/app/chat" label="Chat" icon={<MessageSquare className="h-3.5 w-3.5" />} />
                <SurfaceLink to="/app/studio" label="Studio" icon={<Layers className="h-3.5 w-3.5" />} />
                <SurfaceLink to="/app/tasks" label="Tasks" icon={<Zap className="h-3.5 w-3.5" />} />
                <SurfaceLink to="/app/voice" label="Voice" icon={<Mic className="h-3.5 w-3.5" />} />
                <SurfaceLink to="/app/video" label="Video" icon={<Video className="h-3.5 w-3.5" />} />
              </div>
            </div>
          </div>

          {/* Mobile: collapsed suggestions + surface pills row */}
          <div className="mt-6 space-y-4 lg:hidden">
            <details className="group overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-[13px] font-medium text-malv-text/70 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2">
                  Suggestions
                  {token && recentsQuery.isLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-malv-text/30" aria-hidden />
                  ) : null}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-malv-text/35 transition group-open:rotate-180" aria-hidden />
              </summary>
              <div className="border-t border-white/[0.05]">{suggestionsBody}</div>
            </details>

            <div>
              <p className="mb-2 text-[9px] font-mono uppercase tracking-[0.2em] text-malv-text/32">Other tools</p>
              <ul className="list-none flex snap-x snap-mandatory scroll-smooth gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <li className="shrink-0 snap-start">
                  <SurfacePill to="/app/chat" label="Chat" icon={<MessageSquare className="h-3.5 w-3.5" />} />
                </li>
                <li className="shrink-0 snap-start">
                  <SurfacePill to="/app/studio" label="Studio" icon={<Layers className="h-3.5 w-3.5" />} />
                </li>
                <li className="shrink-0 snap-start">
                  <SurfacePill to="/app/tasks" label="Tasks" icon={<Zap className="h-3.5 w-3.5" />} />
                </li>
                <li className="shrink-0 snap-start">
                  <SurfacePill to="/app/voice" label="Voice" icon={<Mic className="h-3.5 w-3.5" />} />
                </li>
                <li className="shrink-0 snap-start">
                  <SurfacePill to="/app/video" label="Video" icon={<Video className="h-3.5 w-3.5" />} />
                </li>
              </ul>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

function pickInterestingTask(tasks: WorkspaceTask[]): WorkspaceTask | null {
  const priority: Record<WorkspaceTask["status"], number> = {
    in_progress: 0,
    todo: 1,
    done: 8,
    archived: 9
  };
  const sorted = [...tasks].sort((a, b) => priority[a.status] - priority[b.status]);
  return sorted[0] ?? null;
}

function taskStatusLabel(s: WorkspaceTask["status"]) {
  switch (s) {
    case "in_progress":
      return "In progress";
    case "todo":
      return "To do";
    case "done":
      return "Done";
    case "archived":
      return "Archived";
    default:
      return s;
  }
}
