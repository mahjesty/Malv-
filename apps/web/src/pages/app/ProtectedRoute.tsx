import { type ReactNode } from "react";
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
              <div className="text-malv-text/60 text-sm">Establishing secure session…</div>
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
                <h1 className="font-display text-xl font-semibold tracking-tight">Private operator access</h1>
                <p className="text-malv-text/60 text-sm mt-2 leading-relaxed">
                  Sign in to open your MALV control surface. Sessions stay policy-bound and auditable.
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
          <p className="mt-6 text-center text-[11px] font-mono text-malv-text/40 tracking-wide">
            Client gate only — server-side enforcement ships with the API.
          </p>
        </div>
      </div>
    );
  }

  return <>{props.children}</>;
}
