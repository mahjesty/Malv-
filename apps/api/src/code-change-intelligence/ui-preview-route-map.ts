/**
 * Maps touched `*Page.tsx` files under apps/web to dev-preview URL paths.
 * Used only when MALV_UI_PREVIEW_SCREENSHOTS is enabled and a preview base URL is configured.
 */
export const PAGE_BASENAME_TO_PREVIEW_PATH: Record<string, string> = {
  "LandingPage.tsx": "/",
  "FeaturesPage.tsx": "/features",
  "PricingPage.tsx": "/pricing",
  "AboutPage.tsx": "/about",
  "ContactPage.tsx": "/contact",
  "SupportHomePage.tsx": "/support",
  "HelpCenterIndexPage.tsx": "/help",
  "LoginPage.tsx": "/auth/login",
  "SignupPage.tsx": "/auth/signup",
  "OAuthCallbackPage.tsx": "/auth/oauth/callback",
  "ForgotPasswordPage.tsx": "/auth/forgot",
  "ResetPasswordPage.tsx": "/auth/reset",
  "VerifyEmailPage.tsx": "/auth/verify-email",
  "AuthNeuralPage.tsx": "/auth/login",
  "PrivacyPolicyPage.tsx": "/privacy",
  "TermsPage.tsx": "/terms",
  "CookiePolicyPage.tsx": "/cookies",
  "AcceptableUsePolicyPage.tsx": "/acceptable-use",
  "SecurityDataHandlingPage.tsx": "/security",
  "DashboardPage.tsx": "/app",
  "ChatHomePage.tsx": "/app/chat",
  "ConversationsPage.tsx": "/app/conversations",
  "ConversationDetailPage.tsx": "/app/conversations",
  "VideoCallPage.tsx": "/app/video",
  "VoiceCallPage.tsx": "/app/voice",
  "MemoryCenterPage.tsx": "/app/memory",
  "VaultCenterPage.tsx": "/app/vault",
  "FilesUploadsPage.tsx": "/app/files",
  "DeviceCenterPage.tsx": "/app/devices",
  "CollaborationCenterPage.tsx": "/app/collaboration",
  "WorkspacePage.tsx": "/app/workspace",
  "BeastCenterPage.tsx": "/app/beast",
  "NotificationsPage.tsx": "/app/notifications",
  "SupportCenterPage.tsx": "/app/support",
  "TicketListPage.tsx": "/app/tickets",
  "TicketDetailPage.tsx": "/app/tickets",
  "SettingsPage.tsx": "/app/settings",
  "AdminControlPage.tsx": "/app/admin",
  "SelfUpgradeListPage.tsx": "/app/admin/self-upgrade",
  "SelfUpgradeDetailPage.tsx": "/app/admin/self-upgrade",
  "AppShellPage.tsx": "/app"
};

export function previewPathsForTouchedFrontendFiles(touchedRelPaths: string[]): string[] {
  const out: string[] = [];
  for (const p of touchedRelPaths) {
    const norm = p.replace(/\\/g, "/");
    if (!norm.includes("apps/web/")) continue;
    const base = norm.split("/").pop() ?? "";
    if (!base.endsWith(".tsx")) continue;
    const route = PAGE_BASENAME_TO_PREVIEW_PATH[base];
    if (route) out.push(route);
  }
  return [...new Set(out)];
}
