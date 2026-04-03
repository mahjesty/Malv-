import { Navigate, Route, Routes } from "react-router-dom";
import LandingPage from "./pages/marketing/LandingPage";
import FeaturesPage from "./pages/marketing/FeaturesPage";
import PricingPage from "./pages/marketing/PricingPage";
import AboutPage from "./pages/marketing/AboutPage";
import ContactPage from "./pages/marketing/ContactPage";
import SupportHomePage from "./pages/marketing/SupportHomePage";
import HelpCenterIndexPage from "./pages/marketing/HelpCenterIndexPage";
import LoginPage from "./pages/auth/LoginPage";
import SignupPage from "./pages/auth/SignupPage";
import OAuthCallbackPage from "./pages/auth/OAuthCallbackPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import VerifyEmailPage from "./pages/auth/VerifyEmailPage";
import PrivacyPolicyPage from "./pages/legal/PrivacyPolicyPage";
import TermsPage from "./pages/legal/TermsPage";
import CookiePolicyPage from "./pages/legal/CookiePolicyPage";
import AcceptableUsePolicyPage from "./pages/legal/AcceptableUsePolicyPage";
import SecurityDataHandlingPage from "./pages/legal/SecurityDataHandlingPage";
import { ProtectedRoute } from "./pages/app/ProtectedRoute";
import AppShellPage from "./pages/app/AppShellPage";
import AppLayout from "./pages/app/AppLayout";
import { RedirectAdminSelfUpgrade } from "./pages/app/RedirectAdminSelfUpgrade";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/features" element={<FeaturesPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/support" element={<SupportHomePage />} />
      <Route path="/help" element={<HelpCenterIndexPage />} />

      <Route path="/auth/login" element={<LoginPage />} />
      <Route path="/auth/signup" element={<SignupPage />} />
      <Route path="/auth/oauth/callback" element={<OAuthCallbackPage />} />
      <Route path="/auth/forgot" element={<ForgotPasswordPage />} />
      <Route path="/auth/reset" element={<ResetPasswordPage />} />
      <Route path="/auth/verify-email" element={<VerifyEmailPage />} />

      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/cookies" element={<CookiePolicyPage />} />
      <Route path="/acceptable-use" element={<AcceptableUsePolicyPage />} />
      <Route path="/security" element={<SecurityDataHandlingPage />} />

      <Route
        path="/app/*"
        element={
          <ProtectedRoute>
            <AppLayout>
              <AppShellPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route path="/admin/self-upgrade" element={<RedirectAdminSelfUpgrade />} />
      <Route path="/admin/self-upgrade/:id" element={<RedirectAdminSelfUpgrade />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

