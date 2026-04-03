import { useState } from "react";
import MarketingLayout from "../marketing/MarketingLayout";
import { Card, Button, Input } from "@malv/ui";
import { resetPassword } from "../../lib/api/auth";
import { parseNestErrorMessage } from "../../lib/api/http-core";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      await resetPassword({ token: token.trim(), password });
      setDone(true);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(parseNestErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <MarketingLayout>
      <div className="max-w-3xl mx-auto px-4 pt-8 pb-16">
        <div className="text-2xl font-extrabold tracking-tight">Complete reset</div>
        <div className="text-sm text-malv-text/70 mt-2 leading-relaxed">
          Use the token from your password-reset email together with a new password. Successful resets revoke other sessions.
        </div>

        <Card variant="glass" className="p-4 mt-6">
          {!done ? (
            <div className="space-y-3">
              <div>
                <label htmlFor="reset-token" className="text-sm font-semibold mb-2 block">
                  Reset token
                </label>
                <Input id="reset-token" value={token} onChange={setToken} placeholder="Paste token from email" />
              </div>
              <div>
                <label htmlFor="reset-password" className="text-sm font-semibold mb-2 block">
                  New password
                </label>
                <Input
                  id="reset-password"
                  value={password}
                  onChange={setPassword}
                  type="password"
                  placeholder="Create a strong password"
                />
              </div>
              {error ? (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 text-red-200 px-3 py-2 text-sm">{error}</div>
              ) : null}
              <Button type="button" onClick={() => void onSubmit()} disabled={!token.trim() || !password || busy} className="w-full px-6">
                {busy ? "Resetting…" : "Reset password"}
              </Button>
              <div className="text-xs text-malv-text/55">If the token expired, request a new reset from the forgot-password flow.</div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-lg font-extrabold">Password updated</div>
              <div className="text-sm text-malv-text/70 leading-relaxed">You can sign in with your new password. Other sessions were signed out.</div>
              <Button type="button" onClick={() => (window.location.href = "/auth/login")} className="w-full px-6">
                Sign in
              </Button>
            </div>
          )}
        </Card>
      </div>
    </MarketingLayout>
  );
}
