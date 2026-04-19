import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/auth/AuthContext";
import { LogoMark } from "@malv/ui";
import { Button } from "@malv/ui";
import { Card } from "@malv/ui";
import { Skeleton } from "@malv/ui";

export function ProtectedRoute(props: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-malv-canvas bg-malv-radial">
        <Card variant="glass" elevation="deep" className="w-full max-w-md p-6">
          <div className="flex items-center gap-4">
            <LogoMark size={36} variant="animated" className="text-malv-text/92" />
            <div>
              <div className="font-display text-lg font-semibold">MALV</div>
              <div className="text-malv-text/60 text-sm">Checking…</div>
            </div>
          </div>
          <div className="mt-6 space-y-2">
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-2 w-4/5" />
          </div>
        </Card>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-malv-canvas bg-malv-radial">
        <div className="w-full max-w-md">
          <Card variant="glass" elevation="deep" className="p-8">
            <div className="flex items-start gap-4">
              <LogoMark size={40} />
              <div>
                <h1 className="font-display text-xl font-semibold tracking-tight">Sign in to continue</h1>
                <p className="text-malv-text/60 text-sm mt-2 leading-relaxed">
                  Your session expired for security. Sign in again to continue—or create an account if you&apos;re new.
                </p>
              </div>
            </div>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Button onClick={() => (window.location.href = "/auth/login")} className="flex-1 justify-center">
                Sign in
              </Button>
              <Button variant="secondary" onClick={() => (window.location.href = "/auth/signup")} className="flex-1 justify-center">
                Create account
              </Button>
            </div>
          </Card>
          <p className="mt-6 text-center text-xs text-malv-text/45">
            Having trouble signing in?{" "}
            <Link
              to="/support"
              className="text-malv-text/70 underline decoration-malv-text/25 underline-offset-2 transition-colors hover:text-malv-text hover:decoration-malv-text/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/35 focus-visible:rounded-sm"
            >
              Contact support
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return <>{props.children}</>;
}
