import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FileCode2,
  LayoutTemplate,
  Mail,
  Megaphone,
  Sparkles,
  Workflow,
  type LucideIcon
} from "lucide-react";
import { MobileSidebarTrigger } from "../../components/navigation/MobileSidebarTrigger";

type ExploreItem = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  prompt: string;
  kind: "template" | "action";
};

const ITEMS: ExploreItem[] = [
  {
    id: "landing",
    title: "Build landing page",
    description: "Structure, copy, and sections for a sharp single-page site.",
    icon: LayoutTemplate,
    prompt:
      "Design and build a premium landing page: hero, social proof, features, pricing teaser, FAQ, and footer. Keep layout responsive and minimal.",
    kind: "action"
  },
  {
    id: "campaign",
    title: "Marketing campaign",
    description: "Angles, hooks, and channel-ready messaging.",
    icon: Megaphone,
    prompt:
      "Draft a focused marketing campaign: audience, positioning, 3–5 message angles, email subject lines, and a short ad set outline.",
    kind: "action"
  },
  {
    id: "email-seq",
    title: "Email sequence",
    description: "Onboarding or nurture sequence with clear CTAs.",
    icon: Mail,
    prompt: "Write a 5-email nurture sequence with subject lines, body copy, and one CTA per email.",
    kind: "action"
  },
  {
    id: "workflow",
    title: "Automate a workflow",
    description: "Map triggers, steps, and guardrails.",
    icon: Workflow,
    prompt:
      "Design an automation workflow: triggers, steps, failure handling, and human approval gates where needed.",
    kind: "template"
  },
  {
    id: "code-review",
    title: "Review & patch",
    description: "Tight review with suggested fixes.",
    icon: FileCode2,
    prompt:
      "Review the current task for correctness, edge cases, and security. Propose a minimal patch plan before changes.",
    kind: "action"
  },
  {
    id: "starter",
    title: "Open-ended build",
    description: "Describe the outcome; MALV plans execution.",
    icon: Sparkles,
    prompt: "Help me ship the next milestone: clarify requirements, propose a plan, and execute step by step.",
    kind: "template"
  }
];

export function ExplorePage() {
  const navigate = useNavigate();

  const onPick = (item: ExploreItem) => {
    const prompt = encodeURIComponent(item.prompt.slice(0, 8000));
    navigate(`/app/chat?fresh=1&explorePrompt=${prompt}&ensureRuntime=1`);
  };

  return (
    <div className="relative mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-3 pb-28 pt-4 sm:px-6 lg:pb-10">
      <header className="mb-8 flex items-start gap-3">
        <MobileSidebarTrigger />
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-malv-text sm:text-xl">Explore</h1>
          <p className="mt-1 max-w-xl text-[13px] text-malv-text/48">
            Start from a template or a prebuilt action — opens in chat with a structured prompt.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ITEMS.map((item, i) => (
          <motion.button
            key={item.id}
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => onPick(item)}
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 text-left transition-[border-color,box-shadow,transform] duration-200 hover:border-cyan-400/25 hover:bg-white/[0.05] hover:shadow-[0_16px_48px_rgba(0,0,0,0.35)] active:scale-[0.995]"
          >
            <span
              className="pointer-events-none absolute -inset-px opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
              style={{
                background: "radial-gradient(ellipse 70% 60% at 50% 0%, oklch(0.62 0.14 220 / 0.25), transparent 65%)"
              }}
              aria-hidden
            />
            <div className="relative flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-cyan-200/85">
                <item.icon className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold tracking-tight text-malv-text/92">{item.title}</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-malv-text/48">{item.description}</p>
                <p className="mt-3 text-[10px] font-medium uppercase tracking-[0.16em] text-malv-text/32">
                  {item.kind === "action" ? "Prebuilt action" : "Template"}
                </p>
              </div>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
