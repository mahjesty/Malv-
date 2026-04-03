import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Copy,
  Download,
  FileText,
  FolderInput,
  type LucideIcon,
  Pin,
  Pencil,
  Share2,
  Shield,
  Sparkles,
  Tag,
  Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Matches sidebar `ConvRow` — session list item passed into action handlers. */
export type ConversationSessionRow = {
  id: string;
  title: string;
  href: string;
  updatedAtMs: number;
};

export type SessionMenuActionId =
  | "rename"
  | "toggle-pin"
  | "duplicate"
  | "summarize"
  | "studio"
  | "move-workspace"
  | "add-tag"
  | "export"
  | "share"
  | "vault"
  | "delete";

type ActionDef = {
  id: string;
  label: string;
  icon: LucideIcon;
  tone?: "default" | "danger";
  action: SessionMenuActionId;
};

type SectionDef = {
  id: string;
  label: string;
  tone?: "default" | "danger";
  actions: ActionDef[];
};

function buildMenuSource(isPinned: boolean): SectionDef[] {
  return [
    {
      id: "core",
      label: "Core",
      actions: [
        { id: "rename", label: "Rename", icon: Pencil, action: "rename" },
        { id: "toggle-pin", label: isPinned ? "Unpin" : "Pin", icon: Pin, action: "toggle-pin" },
        { id: "duplicate", label: "Duplicate", icon: Copy, action: "duplicate" }
      ]
    },
    {
      id: "intelligence",
      label: "Intelligence",
      actions: [
        { id: "summarize", label: "Summarize", icon: FileText, action: "summarize" },
        { id: "studio", label: "Continue in Studio", icon: Sparkles, action: "studio" }
      ]
    },
    {
      id: "organize",
      label: "Organize",
      actions: [
        { id: "move-folder", label: "Open in Tasks", icon: FolderInput, action: "move-workspace" },
        { id: "tag", label: "Add Tag", icon: Tag, action: "add-tag" }
      ]
    },
    {
      id: "export",
      label: "Export",
      actions: [
        { id: "export", label: "Export", icon: Download, action: "export" },
        { id: "share", label: "Share", icon: Share2, action: "share" }
      ]
    },
    {
      id: "security",
      label: "Security",
      actions: [{ id: "vault", label: "Move to Vault", icon: Shield, action: "vault" }]
    },
    {
      id: "danger",
      label: "Danger",
      tone: "danger",
      actions: [{ id: "delete", label: "Delete", icon: Trash2, tone: "danger", action: "delete" }]
    }
  ];
}

const VIEWPORT_GUTTER = 8;
const ANCHOR_GAP = 8;
/** Single-column command menu width — compact for sidebar context. */
const MENU_WIDTH_PX = 248;

const shellClass = cn(
  "rounded-2xl",
  "border border-white/[0.09]",
  "bg-[#0B0F14]/96",
  "backdrop-blur-md",
  "shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
);

const transition = { duration: 0.14, ease: [0.22, 1, 0.36, 1] as const };

export type ConversationSessionMenuProps = {
  row: ConversationSessionRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPinned: boolean;
  onRunAction: (action: SessionMenuActionId, row: ConversationSessionRow) => void;
};

function useFlyoutPosition(
  open: boolean,
  anchorSelector: string,
  panelRef: RefObject<HTMLDivElement | null>
) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }

    const measure = () => {
      const anchor = document.querySelector<HTMLElement>(anchorSelector);
      const panel = panelRef.current;
      if (!anchor || !panel) return;

      const ar = anchor.getBoundingClientRect();
      const ph = panel.offsetHeight || 200;
      const pw = panel.offsetWidth || MENU_WIDTH_PX;

      // Position relative to the actual trigger row, not the sidebar container.
      // This avoids layout being constrained by sidebar width/overflow.
      let left = ar.right + ANCHOR_GAP;
      if (left + pw > window.innerWidth - VIEWPORT_GUTTER) {
        left = Math.max(VIEWPORT_GUTTER, window.innerWidth - VIEWPORT_GUTTER - pw);
      }
      if (left < VIEWPORT_GUTTER) left = VIEWPORT_GUTTER;

      /* Top-align to the row so the menu reads as anchored to that session, not floating centered. */
      let top = ar.top;
      if (top + ph > window.innerHeight - VIEWPORT_GUTTER) {
        top = Math.max(VIEWPORT_GUTTER, window.innerHeight - VIEWPORT_GUTTER - ph);
      }
      if (top < VIEWPORT_GUTTER) top = VIEWPORT_GUTTER;

      setCoords({ top, left });
    };

    measure();
    const ro = new ResizeObserver(measure);
    if (panelRef.current) ro.observe(panelRef.current);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const id = window.requestAnimationFrame(measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.cancelAnimationFrame(id);
    };
  }, [open, anchorSelector, panelRef]);

  return coords;
}

function SessionMenuSections(props: {
  sections: SectionDef[];
  runAction: (a: ActionDef) => void;
  density: "compact" | "comfortable";
}) {
  const { sections, runAction, density } = props;
  const comfortable = density === "comfortable";

  return (
    <>
      {sections.map((section, sectionIndex) => {
        const isDanger = section.tone === "danger";
        const showDividerBeforeDanger = isDanger && sectionIndex > 0;

        return (
          <div
            key={section.id}
            role="presentation"
            className={cn(sectionIndex > 0 && !showDividerBeforeDanger && (comfortable ? "mt-5" : "mt-3"))}
          >
            {showDividerBeforeDanger ? (
              <div
                className={cn(
                  "border-t border-white/[0.08]",
                  comfortable ? "mb-4 mt-3 pt-4" : "mb-3 mt-2 pt-3"
                )}
                role="separator"
                aria-hidden
              />
            ) : null}
            <p
              className={cn(
                "font-semibold uppercase tracking-[0.14em]",
                comfortable ? "px-1 pb-2 text-[11px]" : "px-2.5 pb-1.5 text-[9px] tracking-[0.16em]",
                isDanger ? "text-red-400/55" : "text-white/42"
              )}
            >
              {section.label}
            </p>
            <div className={cn("flex flex-col", comfortable ? "gap-1" : "gap-0.5")}>
              {section.actions.map((a) => {
                const Icon = a.icon;
                return (
                  <button
                    key={a.id}
                    type="button"
                    role="menuitem"
                    className={cn(
                      "group flex w-full min-w-0 items-center rounded-xl text-left transition-colors duration-150",
                      "outline-none focus-visible:ring-2 focus-visible:ring-white/15 focus-visible:ring-offset-0",
                      comfortable ? "gap-3 px-3 py-3.5 min-h-[52px]" : "gap-2.5 px-2.5 py-2",
                      a.tone === "danger"
                        ? "text-red-400/95 hover:bg-red-500/[0.09] hover:text-red-300 focus-visible:ring-red-400/25 active:bg-red-500/[0.12]"
                        : "text-white/[0.86] hover:bg-white/[0.07] hover:text-white active:bg-white/[0.05]"
                    )}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      runAction(a);
                    }}
                  >
                    <span
                      className={cn(
                        "flex shrink-0 items-center justify-center rounded-xl transition-colors duration-150",
                        comfortable ? "h-10 w-10" : "h-7 w-7",
                        "group-hover:bg-white/[0.06]",
                        a.tone === "danger" && "group-hover:bg-red-500/[0.08]"
                      )}
                    >
                      <Icon
                        className={cn(
                          "shrink-0 transition-colors duration-150",
                          comfortable ? "h-5 w-5" : "h-3.5 w-3.5",
                          a.tone === "danger"
                            ? "text-red-400/90 group-hover:text-red-300"
                            : "text-white/48 group-hover:text-white/88"
                        )}
                        strokeWidth={2}
                      />
                    </span>
                    <span
                      className={cn(
                        "min-w-0 flex-1 font-medium leading-snug",
                        comfortable ? "text-[15px]" : "text-[13px]"
                      )}
                    >
                      {a.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}

export function ConversationSessionMenu(props: ConversationSessionMenuProps) {
  const { row, open, onOpenChange, isPinned, onRunAction } = props;
  const panelRef = useRef<HTMLDivElement>(null);
  const anchorSelector = `#conv-menu-${CSS.escape(row.id)}`;

  const sections = useMemo(() => buildMenuSource(isPinned), [isPinned]);
  const coords = useFlyoutPosition(open, anchorSelector, panelRef);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      const anchor = document.querySelector(anchorSelector);
      if (anchor?.contains(t)) return;
      onOpenChange(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, onOpenChange, anchorSelector]);

  const runAction = useCallback(
    (a: ActionDef) => {
      onRunAction(a.action, row);
      onOpenChange(false);
    },
    [onOpenChange, onRunAction, row]
  );

  const flyout = (
    <AnimatePresence>
      {open ? (
        <motion.div
          ref={panelRef}
          data-malv-session-menu
          role="menu"
          aria-label="Session actions"
          initial={{ opacity: 0, x: -3 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -3 }}
          transition={transition}
          style={{
            position: "fixed",
            zIndex: 1000,
            minWidth: MENU_WIDTH_PX,
            width: "max-content",
            maxWidth: `min(360px, calc(100vw - ${VIEWPORT_GUTTER * 2}px))`,
            maxHeight: "min(420px, calc(100vh - 16px))",
            top: coords?.top ?? -9999,
            left: coords?.left ?? -9999,
            visibility: coords ? "visible" : "hidden",
            pointerEvents: coords ? "auto" : "none"
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className={cn(shellClass, "flex flex-col overflow-hidden")}
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 py-2 [scrollbar-width:thin]">
            <SessionMenuSections sections={sections} runAction={runAction} density="compact" />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      {flyout}
    </>,
    document.body
  );
}
