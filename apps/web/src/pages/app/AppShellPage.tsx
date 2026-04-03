/**
 * App shell layout — premium surface; coordinate changes via `src/lib/ui/premiumUiBoundary.ts`.
 */
import { Route, Routes, useLocation, Navigate } from "react-router-dom";
import { useMalvNewChatShortcut } from "../../lib/chat/useMalvNewChatShortcut";
import { TopBar } from "../../components/navigation/TopBar";
import { BottomNav } from "../../components/navigation/BottomNav";
import { AppSidebar } from "../../components/navigation/AppSidebar";
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
import { ExplorePage } from "./ExplorePage";
import { AdminControlPage } from "./AdminControlPage";
import AdminLayout from "./AdminLayout";
import { SelfUpgradeListPage } from "./SelfUpgradeListPage";
import { SelfUpgradeDetailPage } from "./SelfUpgradeDetailPage";
import { AdminGate } from "./AdminGate";
import { useAuth } from "../../lib/auth/AuthContext";
import { type ReactNode } from "react";
import { MalvAppShellProvider } from "../../lib/context/MalvAppShellContext";
import { MalvChatComposerSettingsProvider } from "../../lib/settings/MalvChatComposerSettingsContext";
import { VoiceCallShellProvider } from "../../lib/voice/VoiceCallShellContext";
import { VoiceCallGlobalLayer } from "../../components/call/VoiceCallGlobalLayer";
import { RuntimeDrawerHost } from "../../components/chat/RuntimeDrawerHost";

function Icon(props: { children: ReactNode }) {
  return <span className="opacity-95">{props.children}</span>;
}

function SmallSvgIcon(pathD: string) {
  return (
    <Icon>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d={pathD} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    </Icon>
  );
}

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
      subtitle: "Templates and prebuilt actions to start fast.",
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
  useMalvNewChatShortcut();

  if (isAppHome(location.pathname)) {
    return (
      <div className="malv-dashboard-v0 landing-v0 dark fixed inset-0 z-[40] overflow-hidden bg-background font-sans text-foreground antialiased">
        <DashboardPage />
      </div>
    );
  }

  const bottomItems = [
    {
      to: "/app/chat",
      label: "Chat",
      end: true,
      icon: SmallSvgIcon("M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z")
    },
    {
      to: "/app/tasks",
      label: "Tasks",
      icon: SmallSvgIcon("M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11")
    },
    {
      to: "/app/inbox",
      label: "Inbox",
      icon: SmallSvgIcon("M22 12h-6l-2 3h-8l-2-3H2M2 3h20v18H2V3z")
    },
    {
      to: "/app/explore",
      label: "Explore",
      icon: SmallSvgIcon("M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83")
    },
    { to: "/app/studio", label: "Studio", icon: SmallSvgIcon("M12 2l3 7h7l-5.5 4 2 7L12 17l-6.5 3 2-7L2 9h7l3-7z") }
  ];

  return (
    <MalvAppShellProvider>
      <MalvChatComposerSettingsProvider>
        <VoiceCallShellProvider>
      <div
        className={[
          "dark flex text-malv-text antialiased",
          immersive
            ? "h-[100dvh] overflow-hidden overscroll-none malv-operator malv-operator-chat-bg"
            : "min-h-screen bg-malv-canvas bg-malv-radial"
        ].join(" ")}
      >
        <div className="flex min-h-0 min-w-0 flex-1">
          <AppSidebar showAdmin={showAdmin} />

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {!immersive ? <TopBar title={meta.title} subtitle={meta.subtitle} activity={meta.activity} /> : null}

            <main
              className={[
                "min-h-0 min-w-0 flex-1",
                immersive
                  ? "flex flex-col overflow-hidden overscroll-none pb-4 pt-0 lg:pb-6"
                  : "min-h-[50dvh] pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-10"
              ].join(" ")}
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
                <Route path="explore" element={<ExplorePage />} />
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

        {!immersive ? <BottomNav items={bottomItems} /> : null}
        <VoiceCallGlobalLayer />
        <RuntimeDrawerHost />
      </div>
        </VoiceCallShellProvider>
      </MalvChatComposerSettingsProvider>
    </MalvAppShellProvider>
  );
}
