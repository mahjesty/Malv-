/**
 * Full `MalvLandingPagePreview` component source for local Explore / intake dev fixtures.
 * Split into parts for maintainability; concatenation preserves exact file content.
 */
const P1 = `export default function MalvLandingPagePreview() {
  const features = [
    {
      title: "Presence that feels alive",
      body: "Voice, memory, and emotionally aware interaction designed to feel natural across chat, calls, and execution surfaces.",
    },
    {
      title: "Execution, not just answers",
      body: "Plan, inspect, build, and act with a workspace built for real tasks, trusted previews, and controlled automation.",
    },
    {
      title: "Private by design",
      body: "Vault-aware intelligence, secure review flows, and transparent control over what MALV sees, stores, and runs.",
    },
  ];

  const stats = [
    { label: "Context surfaces", value: "6" },
    { label: "Execution modes", value: "12+" },
    { label: "Latency target", value: "<250ms" },
    { label: "Trust posture", value: "Policy-first" },
  ];

  const pills = ["Private AI", "Voice + Video", "Workspace Actions", "Safe Preview", "Memory Layers"];

  return (
    <div className="min-h-screen bg-[#05070b] text-white overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(73,114,255,0.18),transparent_32%),radial-gradient(circle_at_80%_20%,rgba(0,220,190,0.14),transparent_24%),radial-gradient(circle_at_50%_100%,rgba(117,64,255,0.12),transparent_30%)]" />

      <header className="relative z-10 border-b border-white/10 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/15 bg-white/5 shadow-[0_0_40px_rgba(64,104,255,0.2)]">
              <div className="h-4 w-4 rounded-full bg-gradient-to-br from-cyan-300 via-blue-400 to-violet-500" />
            </div>
            <div>
              <p className="text-lg font-semibold tracking-wide">MALV</p>
              <p className="text-xs text-white/45">Living personal intelligence</p>
            </div>
          </div>

          <nav className="hidden items-center gap-8 text-sm text-white/65 md:flex">
            <a href="#capabilities" className="transition hover:text-white">Capabilities</a>
            <a href="#experience" className="transition hover:text-white">Experience</a>
            <a href="#trust" className="transition hover:text-white">Trust</a>
          </nav>

          <div className="flex items-center gap-3">
            <button className="rounded-full border border-white/12 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10">
              Watch Preview
            </button>
            <button className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:scale-[1.02]">
              Enter Workspace
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <section className="mx-auto grid max-w-7xl gap-14 px-6 pb-16 pt-16 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:pb-24 lg:pt-24">
          <div className="max-w-2xl">
            <div className="mb-6 flex flex-wrap gap-2">
              {pills.map((pill) => (
                <span
                  key={pill}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/65"
                >
                  {pill}
                </span>
              ))}
            </div>

            <h1 className="max-w-4xl text-5xl font-semibold leading-[0.98] tracking-tight text-white md:text-7xl">
              The AI that can
              <span className="bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-400 bg-clip-text text-transparent"> think, act, and stay with you</span>
              .
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-white/68 md:text-xl">
              MALV is a private, execution-first intelligence built for presence, memory, and real work. It does not just respond. It understands context, previews safely, and helps you move from idea to outcome.
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <button className="rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:scale-[1.02]">
                Start with MALV
              </button>
              <button className="rounded-full border border-white/12 bg-white/5 px-6 py-3 text-sm text-white/85 transition hover:bg-white/10">
                Explore the Studio
              </button>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
                  <div className="text-2xl font-semibold text-white">{stat.value}</div>
                  <div className="mt-1 text-sm text-white/52">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
`;

const P2 = `
          <div className="relative">
            <div className="absolute -inset-8 rounded-[2.5rem] bg-gradient-to-br from-cyan-400/10 via-blue-500/10 to-violet-500/10 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/12 bg-[#0a0f16]/90 p-4 shadow-[0_30px_120px_rgba(0,0,0,0.55)]">
              <div className="rounded-[1.5rem] border border-white/10 bg-[#071019] p-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/85">Live Session</p>
                    <h2 className="mt-2 text-xl font-semibold">MALV Workspace</h2>
                  </div>
                  <div className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">
                    Ready
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                  <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.035] p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-white/55">Thinking layer</p>
                        <p className="mt-1 text-lg font-medium">Cross-surface continuity</p>
                      </div>
                      <div className="h-3 w-3 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(110,231,255,0.9)]" />
                    </div>

                    <div className="mt-6 rounded-2xl border border-white/8 bg-[#04070d] p-4">
                      <p className="text-xs text-white/45">Current objective</p>
                      <p className="mt-2 text-sm leading-6 text-white/78">
                        Build a premium launch page, verify preview safety, and prepare a reusable component system for the Studio handoff.
                      </p>
                    </div>

                    <div className="mt-4 space-y-3">
                      {[
                        "Analyzing source structure",
                        "Mapping preview-safe regions",
                        "Preparing execution plan",
                      ].map((item) => (
                        <div key={item} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3">
                          <div className="h-2 w-2 rounded-full bg-blue-400" />
                          <span className="text-sm text-white/72">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.035] p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-white/55">Embodiment layer</p>
                        <p className="mt-1 text-lg font-medium">Voice + presence + execution</p>
                      </div>
                      <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/65">
                        Private mode available
                      </div>
                    </div>

                    <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(83,116,255,0.22),transparent_36%),linear-gradient(180deg,#08111d_0%,#06090f_100%)] p-6">
                      <div className="mx-auto flex h-44 w-44 items-center justify-center rounded-full border border-cyan-300/15 bg-[radial-gradient(circle,rgba(124,239,255,0.18),rgba(17,24,39,0.06)_45%,transparent_72%)] shadow-[0_0_100px_rgba(56,189,248,0.18)]">
                        <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/12 bg-white/[0.05] text-sm text-white/75">
                          MALV
                        </div>
                      </div>

                      <div className="mt-6 grid grid-cols-3 gap-3">
                        {[
                          ["Trust", "Policy-first"],
                          ["Memory", "Layered"],
                          ["Action", "Sandboxed"],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                            <div className="text-xs text-white/42">{label}</div>
                            <div className="mt-1 text-sm font-medium text-white/82">{value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
`;

const P3 = `
        <section id="capabilities" className="mx-auto max-w-7xl px-6 py-12 lg:px-8 lg:py-16">
          <div className="mb-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-cyan-300/80">Capabilities</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
                Built for real work across thought, action, and trust.
              </h2>
            </div>
            <p className="max-w-2xl text-white/60">
              From private calls and memory-aware chat to preview-safe execution and structured systems, MALV is designed as a full intelligence surface.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-[1.75rem] border border-white/10 bg-white/[0.035] p-6 transition duration-300 hover:-translate-y-1 hover:border-white/15 hover:bg-white/[0.05]"
              >
                <div className="mb-5 h-12 w-12 rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-300/15 via-blue-400/10 to-violet-400/15" />
                <h3 className="text-xl font-medium text-white">{feature.title}</h3>
                <p className="mt-3 text-sm leading-7 text-white/62">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="experience" className="mx-auto max-w-7xl px-6 py-12 lg:px-8 lg:py-20">
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-8">
              <p className="text-sm uppercase tracking-[0.24em] text-violet-300/80">Experience</p>
              <h3 className="mt-4 text-3xl font-semibold tracking-tight">One intelligence, many surfaces.</h3>
              <p className="mt-4 max-w-xl text-white/62">
                Move from chat to call to Studio to task execution without losing continuity. MALV carries intent, context, and risk posture across every surface.
              </p>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-[#0a0e15] p-8">
              <div className="space-y-5">
                {[
                  {
                    title: "Chat → Studio handoff",
                    body: "Design direction, build context, and execution history stay connected.",
                  },
                  {
                    title: "Preview-safe by default",
                    body: "Truthful live preview when available, clear fallback when a surface cannot be rendered safely.",
                  },
                  {
                    title: "Human-trustable decisions",
                    body: "Risk-aware review, visible reasoning, and controlled action instead of hidden automation.",
                  },
                ].map((item, index) => (
                  <div key={item.title} className="flex gap-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-sm text-white/70">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium text-white">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-white/58">{item.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="trust" className="mx-auto max-w-7xl px-6 pb-24 pt-8 lg:px-8">
          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(16,21,31,0.95),rgba(9,13,20,0.95))]">
            <div className="grid gap-10 p-8 lg:grid-cols-[1.05fr_0.95fr] lg:p-12">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-cyan-300/80">Trust Layer</p>
                <h3 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
                  Powerful enough to act. Careful enough to earn confidence.
                </h3>
                <p className="mt-5 max-w-2xl text-white/62">
                  MALV is designed around truthful system state, layered memory, private control surfaces, and clear policy-aware execution boundaries.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  "Truthful preview states",
                  "Audit-aware source intake",
                  "Layered private memory",
                  "Controlled execution boundaries",
                ].map((item) => (
                  <div key={item} className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5 text-sm text-white/75">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
`;

export const MALV_LANDING_PREVIEW_SOURCE = P1 + P2 + P3;

export const MALV_LANDING_PREVIEW_FILENAME = "MalvLandingPagePreview.tsx";
