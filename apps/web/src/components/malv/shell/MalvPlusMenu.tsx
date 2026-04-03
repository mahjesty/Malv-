import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  getMalvPlusMenuActions,
  groupMalvPlusActionsByCategory,
  MALV_PLUS_CATEGORY_LABELS,
  MALV_PLUS_CATEGORY_ORDER
} from "@/lib/malv-plus";
import type { MalvPlusActionDefinition, MalvPlusVisibilityContext } from "@/lib/malv-plus";

const MENU_WIDTH_PX = 300;
const VIEWPORT_MARGIN = 10;
const GAP_PX = 8;

function useMalvPlusMenuPosition(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  contentKey: string
) {
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const update = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !open) return;

    const ar = anchor.getBoundingClientRect();
    const width = Math.min(MENU_WIDTH_PX, window.innerWidth - VIEWPORT_MARGIN * 2);
    let left = ar.left;
    if (left + width > window.innerWidth - VIEWPORT_MARGIN) {
      left = window.innerWidth - VIEWPORT_MARGIN - width;
    }
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;

    const measuredH = panel?.getBoundingClientRect().height || 280;
    let top = ar.bottom + GAP_PX;
    if (top + measuredH > window.innerHeight - VIEWPORT_MARGIN) {
      const above = ar.top - GAP_PX - measuredH;
      if (above >= VIEWPORT_MARGIN) top = above;
      else top = Math.max(VIEWPORT_MARGIN, window.innerHeight - VIEWPORT_MARGIN - measuredH);
    }

    setCoords({ top, left });
  }, [anchorRef, open, panelRef]);

  useLayoutEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => update());
    });
  }, [open, update, contentKey]);

  useEffect(() => {
    if (!open) return;
    const onWin = () => update();
    window.addEventListener("scroll", onWin, true);
    window.addEventListener("resize", onWin);
    return () => {
      window.removeEventListener("scroll", onWin, true);
      window.removeEventListener("resize", onWin);
    };
  }, [open, update]);

  return coords;
}

type MalvPlusMenuProps = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  anchorRef: RefObject<HTMLElement | null>;
  visibility: MalvPlusVisibilityContext;
  onActivate: (action: MalvPlusActionDefinition) => void;
};

export function MalvPlusMenu(props: MalvPlusMenuProps) {
  const { open, onOpenChange, anchorRef, visibility, onActivate } = props;
  const panelRef = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState(0);

  const menuActions = useMemo(() => getMalvPlusMenuActions(visibility), [visibility]);
  const grouped = useMemo(() => groupMalvPlusActionsByCategory(menuActions), [menuActions]);

  const flatRows = useMemo(() => {
    const rows: MalvPlusActionDefinition[] = [];
    for (const cat of MALV_PLUS_CATEGORY_ORDER) {
      const list = grouped[cat];
      if (!list?.length) continue;
      rows.push(...list);
    }
    return rows;
  }, [grouped]);

  const rowIndexById = useMemo(() => {
    const m = new Map<string, number>();
    flatRows.forEach((a, i) => m.set(a.id, i));
    return m;
  }, [flatRows]);

  const coords = useMalvPlusMenuPosition(open, anchorRef, panelRef, flatRows.map((r) => r.id).join("|"));

  useEffect(() => {
    if (open) setFocusIndex(0);
  }, [open, flatRows.length]);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    const buttons = panelRef.current.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]');
    const el = buttons[focusIndex];
    if (el && !el.disabled) el.focus();
  }, [focusIndex, open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", onDoc);
    return () => document.removeEventListener("keydown", onDoc);
  }, [open, onOpenChange]);

  const onMenuKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (flatRows.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIndex((i) => (i + 1) % flatRows.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((i) => (i - 1 + flatRows.length) % flatRows.length);
      } else if (e.key === "Home") {
        e.preventDefault();
        setFocusIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setFocusIndex(flatRows.length - 1);
      }
    },
    [flatRows.length]
  );

  const portalTarget = typeof document !== "undefined" ? document.body : null;

  if (!portalTarget) return null;

  const menuWidth = Math.min(MENU_WIDTH_PX, window.innerWidth - VIEWPORT_MARGIN * 2);

  return createPortal(
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            key="malv-plus-scrim"
            aria-hidden
            className="fixed inset-0 z-[190]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onMouseDown={(e) => {
              e.preventDefault();
              onOpenChange(false);
            }}
            style={{ background: "rgba(2,6,23,0.12)" }}
          />
          <motion.div
            id="malv-plus-menu"
            key="malv-plus-panel"
            ref={panelRef}
            role="menu"
            aria-label="MALV+ actions"
            className="fixed z-[200] overflow-hidden rounded-2xl border border-white/[0.09] shadow-[0_24px_80px_rgba(0,0,0,0.55),inset_0_1px_0_oklch(1_0_0/0.06)] outline-none backdrop-blur-xl"
            style={{
              top: coords.top,
              left: coords.left,
              width: menuWidth,
              background:
                "linear-gradient(165deg, oklch(0.14 0.025 260 / 0.97) 0%, oklch(0.09 0.02 265 / 0.98) 55%, oklch(0.07 0.02 270 / 0.99) 100%)"
            }}
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.99 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onKeyDown={onMenuKeyDown}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,oklch(0.45_0.12_220/0.12),transparent_55%)]" />
            <div className="relative max-h-[min(70vh,420px)] overflow-y-auto overscroll-contain px-1.5 py-2.5 sm:px-2 sm:py-3">
              {MALV_PLUS_CATEGORY_ORDER.map((cat) => {
                const list = grouped[cat];
                if (!list?.length) return null;
                return (
                  <div key={cat} className="mb-3 last:mb-0">
                    <p className="px-2.5 pb-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-malv-text/38">
                      {MALV_PLUS_CATEGORY_LABELS[cat]}
                    </p>
                    <div className="flex flex-col gap-0.5">
                      {list.map((action) => {
                        const globalIdx = rowIndexById.get(action.id) ?? 0;
                        const Icon = action.icon;
                        const rowDisabled = !action.enabled || Boolean(action.comingSoon);
                        const isFocused = globalIdx === focusIndex;
                        return (
                          <button
                            key={action.id}
                            type="button"
                            role="menuitem"
                            tabIndex={isFocused ? 0 : -1}
                            disabled={rowDisabled}
                            className={[
                              "flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-left transition-colors",
                              rowDisabled
                                ? "cursor-not-allowed opacity-45"
                                : "cursor-pointer hover:bg-white/[0.05] active:bg-white/[0.07]",
                              isFocused && !rowDisabled ? "bg-white/[0.06] ring-1 ring-white/[0.08]" : ""
                            ].join(" ")}
                            onMouseEnter={() => setFocusIndex(globalIdx)}
                            onFocus={() => setFocusIndex(globalIdx)}
                            onClick={() => {
                              if (rowDisabled) return;
                              onActivate(action);
                              onOpenChange(false);
                            }}
                          >
                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-malv-text/78">
                              <Icon className="h-[17px] w-[17px]" strokeWidth={1.85} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span className="text-[13.5px] font-medium leading-tight tracking-[-0.02em] text-malv-text/[0.94]">
                                  {action.title}
                                </span>
                                {action.badge ? (
                                  <span className="rounded-md border border-white/[0.1] bg-white/[0.04] px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-malv-text/55">
                                    {action.badge}
                                  </span>
                                ) : null}
                              </span>
                              <span className="mt-0.5 block text-[11.5px] leading-snug text-malv-text/48">
                                {action.subtitle}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="relative border-t border-white/[0.06] px-3 py-2">
              <p className="text-center text-[10px] leading-relaxed tracking-wide text-malv-text/38">
                MALV+ grows with you — more tools on the way
              </p>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    portalTarget
  );
}
