/**
 * MALV — Premium UI boundary (design contract)
 *
 * Core product surfaces (app shell, chat, side navigation, voice/video call UI, composer,
 * top-level navigation patterns) are the **visual identity** of MALV. They should not be
 * casually rewritten during backend, orchestration, or API work.
 *
 * When changing behavior:
 * - Prefer wiring **data/transport** through existing layout components, or add narrow props.
 * - If layout must change, preserve **spacing rhythm**, **typography scale**, **motion timing**,
 *   and **dark-first atmosphere** defined in these areas.
 * - Extract shared presentation into `components/malv/`, `components/chat/`, `components/call/`,
 *   `components/navigation/`
 *   so system features can ship without flattening the UI into generic SaaS patterns.
 *
 * Protected surfaces (non-exhaustive):
 * - `AppShellPage`, `AppSidebar`, `TopBar`, `BottomNav`
 * - `ChatHomePage` + chat presentation components
 * - `VideoCallPage` + call presence / motion layer
 * - `ModuleShell` (page chrome density)
 *
 * This file is documentation-only; importing it is optional.
 */
export const __MALV_PREMIUM_UI_BOUNDARY = true;
