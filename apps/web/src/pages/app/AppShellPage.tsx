/**
 * App shell layout — premium surface; coordinate changes via `src/lib/ui/premiumUiBoundary.ts`.
 */
import { Route, Routes, useLocation, Navigate } from "react-router-dom";
import { useMalvNewChatShortcut } from "../../lib/chat/useMalvNewChatShortcut";
import { TopBar } from "../../components/navigation/TopBar";
import AppSidebar from "../../components/navigation/AppSidebar";
import { ChatHomePage } from "./ChatHomePage";
import { DashboardPage } from "./DashboardPage";
import { ConversationsPage } from "./ConversationsPage";
import { ConversationDetailPage } from "./ConversationDetailPage";
import { VideoCallPage } from "./VideoCallPage";
import { VoiceCallPage } from "./VoiceCallPage";
import { MemoryCenterPage } from "./MemoryCenterPage";
import { VaultCenterPage } from "./VaultCenterPage";
import { FilesUploadsPage } from "./FilesUploadsPage";
import { DeviceCenterPage } from "./DeviceCenterPage";
import { CollaborationCenterPage } from "./CollaborationCenterPage";
import { WorkspacePage } from "./WorkspacePage";
import { BeastCenterPage } from "./BeastCenterPage";
import { NotificationsPage } from "./NotificationsPage";
import { SupportCenterPage } from "./SupportCenterPage";
import { TicketListPage } from "./TicketListPage";
import { TicketDetailPage } from "./TicketDetailPage";
import { SettingsPage } from "./SettingsPage";
import { MalvStudioPage } from "./MalvStudioPage";
import { TasksPage } from "./TasksPage";
import { InboxPage } from "./InboxPage";
import { ExploreLayout } from "./explore/ExploreLayout";
import { ExploreHubPage } from "./explore/ExploreHubPage";
import { ExploreCapabilityPage } from "./explore/ExploreCapabilityPage";
import { ExploreSourceIntakePage } from "./explore/ExploreSourceIntakePage";
import { ExploreUnitLegacyRedirect } from "./explore/ExploreUnitLegacyRedirect";
import { ExploreImageSessionPage } from "./explore/ExploreImageSessionPage";
import { AdminControlPage } from "./AdminControlPage";
import AdminLayout from "./AdminLayout";
import { SelfUpgradeListPage } from "./SelfUpgradeListPage";
import { SelfUpgradeDetailPage } from "./SelfUpgradeDetailPage";
import { AdminGate } from "./AdminGate";
import { useAuth } from "../../lib/auth/AuthContext";
import { MalvAppShellProvider } from "../../lib/context/MalvAppShellContext";
import { MalvChatComposerSettingsProvider } from "../../lib/settings/MalvChatComposerSettingsContext";
import { VoiceCallShellProvider } from "../../lib/voice/VoiceCallShellContext";
import { VoiceCallGlobalLayer } from "../../components/call/VoiceCallGlobalLayer";
import { RuntimeDrawerHost } from "../../components/chat/RuntimeDrawerHost";

type Activity = "live" | "processing" | "idle";

function matchRouteMeta(pathname: string): { title: string; subtitle?: string; activity: Activity } {
  const table: Array<{ test: (p: string) => boolean; title: string; subtitle?: string; activity: Activity }> = [
    {
      test: (p) => p === "/app" || p === "/app/",
      title: "Mission control",
      subtitle: "System posture, subsystems, and next actions.",
      activity: "live"
    },
    {
      test: (p) => p.startsWith("/app/workspace"),
      title: "Workspace",
      subtitle: "Legacy hub — prefer Chat, Tasks, and Inbox.",
      activity: "live"
    },
    {
      test: (p) => p.startsWith("/app/tasks"),
      title: "Tasks",
      subtitle: "Execution queue — what MALV is running or will run next.",
      activity: "processing"
    },
    {
      test: (p) => p.startsWith("/app/inbox"),
      title: "Inbox",
      subtitle: "Approvals, outcomes, and alerts that need you.",
      activity: "live"
    },
    {
      test: (p) => p.startsWith("/app/explore"),
      title: "Explore",
      subtitle: "Discover, launch, and continue workflows.",
      activity: "idle"
    },
    {
      test: (p) => p.startsWith("/app/chat"),
      title: "Chat",
      subtitle: "Primary channel — talk to MALV and steer execution.",
      activity: "processing"
    },
    {
      test: (p) => p.startsWith("/app/conversations/"),
      title: "Session detail",
      subtitle: "Transcript, memory scope, and audit references.",
      activity: "idle"
    },
    {
      test: (p) => p.startsWith("/app/conversations"),
      title: "Session history",
      subtitle: "Recover context and continue work without losing policy boundaries.",
      activity: "idle"
    },
    { test: (p) => p.startsWith("/app/video"), title: "Video link", subtitle: "Presence, transcripts, and policy-aware capture.", activity: "live" },
    { test: (p) => p.startsWith("/app/voice"), title: "Voice call", subtitle: "Operator voice channel with live session state.", activity: "live" },
    { test: (p) => p.startsWith("/app/memory"), title: "Memory scopes", subtitle: "Layered recall with strict isolation.", activity: "idle" },
    { test: (p) => p.startsWith("/app/vault"), title: "Vault", subtitle: "Sealed context — identity verified access only.", activity: "idle" },
    { test: (p) => p.startsWith("/app/files"), title: "File intelligence", subtitle: "Ingest, understand, route through private workers.", activity: "processing" },
    { test: (p) => p.startsWith("/app/devices"), title: "Devices", subtitle: "Trust, sessions, and revocable permissions.", activity: "idle" },
    {
      test: (p) => p.startsWith("/app/collaboration"),
      title: "Collaboration",
      subtitle: "Search people, shared rooms, and invites — MALV-aware spaces (next: group threads).",
      activity: "live"
    },
    { test: (p) => p.startsWith("/app/beast"), title: "Beast control", subtitle: "Proactive intelligence + GPU-routed reasoning.", activity: "processing" },
    {
      test: (p) => p.startsWith("/app/notifications"),
      title: "Activity",
      subtitle: "Feed not connected — use sessions and tickets for actionable history.",
      activity: "idle"
    },
    {
      test: (p) => p.startsWith("/app/support"),
      title: "Support",
      subtitle: "Ticket-based escalation — AI triage is not wired in this build.",
      activity: "idle"
    },
    {
      test: (p) => p.startsWith("/app/tickets"),
      title: "Tickets",
      subtitle: "Track resolution without losing the thread.",
      activity: "idle"
    },
    { test: (p) => p.startsWith("/app/settings"), title: "Preferences", subtitle: "Presence, Beast defaults, vault, and layout — crisp controls for a high-trust operator plane.", activity: "idle" },
    {
      test: (p) => p.startsWith("/app/studio"),
      title: "MALV Studio",
      subtitle: "Visual AI build workspace — target, preview, inspect, and safely apply.",
      activity: "processing"
    },
    {
      test: (p) => p.startsWith("/app/admin/self-upgrade"),
      title: "Self-upgrade lab",
      subtitle: "Sandbox staging, validation, and admin preview before production apply.",
      activity: "processing"
    },
    { test: (p) => p.startsWith("/app/admin"), title: "Admin", subtitle: "System posture and runtime visibility.", activity: "live" }
  ];

  const found = table.find((t) => t.test(pathname));
  return found ? { title: found.title, subtitle: found.subtitle, activity: found.activity } : { title: "MALV", activity: "idle" };
}

function isAppHome(pathname: string) {
  return pathname === "/app" || pathname === "/app/";
}

function isImmersiveApp(pathname: string) {
  return /^\/app\/(chat|video|voice)\/?$/.test(pathname);
}

export default function AppShellPage() {
  const location = useLocation();
  const { role } = useAuth();
  const showAdmin = role === "admin";
  const meta = matchRouteMeta(location.pathname);
  const immersive = isImmersiveApp(location.pathname);
  const exploreChrome = location.pathname.startsWith("/app/explore");
  useMalvNewChatShortcut();

  if (isAppHome(location.pathname)) {
    return (
      <div className="malv-dashboard-v0 landing-v0 dark fixed inset-0 z-[40] overflow-hidden bg-background font-sans text-foreground antialiased">
        <DashboardPage />
      </div>
    );
  }

  return (
    <MalvAppShellProvider>
      <MalvChatComposerSettingsProvider>
        <VoiceCallShellProvider>
          {/*
            Outer shell is ALWAYS viewport-locked.
            h-[100dvh] + overflow-hidden prevent the container from growing with content.
            Only immersive-specific atmosphere classes are conditional.
          */}
          <div
            className={[
              "flex h-[100dvh] overflow-hidden text-malv-text antialiased",
              immersive ? "overscroll-none malv-operator malv-operator-chat-bg" : ""
            ].filter(Boolean).join(" ")}
            style={{ background: "rgb(var(--malv-canvas-rgb))", transition: "background-color 220ms ease" }}
          >
            {/* Sidebar + content pane: a bounded flex row filling the viewport */}
            <div className="flex h-full min-w-0 flex-1">
              <AppSidebar showAdmin={showAdmin} />

              {/* Main column: TopBar (shrink-0) + scrolling content pane (flex-1) */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                {!immersive ? (
                  <TopBar
                    title={meta.title}
                    subtitle={meta.subtitle}
                    activity={meta.activity}
                    dense={exploreChrome}
                    edgeless={exploreChrome}
                  />
                ) : null}

                {/*
                  <main> is the sole scroll owner for non-immersive pages.
                  overflow-y-auto here means content scrolls; the sidebar never moves.
                  Immersive routes (chat/video/voice) manage their own internal scroll.
                */}
                <main
                  className={[
                    "min-h-0 min-w-0 flex-1",
                    immersive
                      ? "flex flex-col overflow-hidden overscroll-none pb-4 pt-0 lg:pb-6"
                      : "overflow-y-auto pb-10"
                  ].join(" ")}
                  style={immersive ? undefined : { WebkitOverflowScrolling: "touch" }}
                >
                  <Routes>
                    <Route index element={<DashboardPage />} />
                    <Route path="chat" element={<ChatHomePage />} />
                    <Route path="conversations" element={<ConversationsPage />} />
                    <Route path="conversations/:id" element={<ConversationDetailPage />} />
                    <Route path="video" element={<VideoCallPage />} />
                    <Route path="voice" element={<VoiceCallPage />} />

                    <Route path="memory" element={<MemoryCenterPage />} />
                    <Route path="vault" element={<VaultCenterPage />} />

                    <Route path="files" element={<FilesUploadsPage />} />
                    <Route path="devices" element={<DeviceCenterPage />} />
                    <Route path="collaboration" element={<CollaborationCenterPage />} />
                    <Route path="workspace" element={<WorkspacePage />} />
                    <Route path="tasks" element={<TasksPage />} />
                    <Route path="inbox" element={<InboxPage />} />
                    <Route path="explore" element={<ExploreLayout />}>
                      <Route index element={<ExploreHubPage />} />
                      <Route path="import" element={<ExploreSourceIntakePage />} />
                      <Route path="unit/:unitId" element={<ExploreUnitLegacyRedirect />} />
                      <Route path="create/image/session" element={<ExploreImageSessionPage />} />
                      <Route path=":categoryId/:capabilityId" element={<ExploreCapabilityPage />} />
                      <Route path="*" element={<Navigate to="/app/explore" replace />} />
                    </Route>
                    <Route path="studio" element={<MalvStudioPage />} />

                    <Route path="beast" element={<BeastCenterPage />} />

                    <Route path="notifications" element={<NotificationsPage />} />

                    <Route path="support" element={<SupportCenterPage />} />
                    <Route path="tickets" element={<TicketListPage />} />
                    <Route path="tickets/:id" element={<TicketDetailPage />} />

                    <Route path="settings" element={<SettingsPage />} />

                    <Route
                      path="admin"
                      element={
                        <AdminGate>
                          <AdminLayout />
                        </AdminGate>
                      }
                    >
                      <Route index element={<AdminControlPage />} />
                      <Route path="self-upgrade" element={<SelfUpgradeListPage />} />
                      <Route path="self-upgrade/:id" element={<SelfUpgradeDetailPage />} />
                    </Route>

                    <Route path="*" element={<Navigate to="/app" replace />} />
                  </Routes>
                </main>
              </div>
            </div>

            <VoiceCallGlobalLayer />
            <RuntimeDrawerHost />
          </div>
        </VoiceCallShellProvider>
      </MalvChatComposerSettingsProvider>
    </MalvAppShellProvider>
  );
}
