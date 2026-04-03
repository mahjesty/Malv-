import { useState } from "react";
import MarketingLayout from "../marketing/MarketingLayout";
import { Card, Button, Input } from "@malv/ui";
import { forgotPassword } from "../../lib/api/auth";
import { parseNestErrorMessage } from "../../lib/api/http-core";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      await forgotPassword({ email: email.trim() });
      setSent(true);
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
        <div className="text-2xl font-extrabold tracking-tight">Reset password</div>
        <div className="text-sm text-malv-text/70 mt-2 leading-relaxed">
          If an account exists for this email, we accept the request. Reset links are delivered through the configured mail path in
          production; in development the server may log the token for testing.
        </div>

        <Card variant="glass" className="p-4 mt-6">
          {!sent ? (
            <div className="space-y-3">
              <div>
                <label htmlFor="forgot-email" className="text-sm font-semibold mb-2 block">
                  Email
                </label>
                <Input id="forgot-email" value={email} onChange={setEmail} type="email" placeholder="you@domain.com" />
              </div>
              {error ? (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 text-red-200 px-3 py-2 text-sm">{error}</div>
              ) : null}
              <Button type="button" onClick={() => void onSubmit()} disabled={!email.trim() || busy} className="w-full px-6">
                {busy ? "Sending…" : "Send reset request"}
              </Button>
              <div className="text-xs text-malv-text/55">
                For security we do not reveal whether an address is registered. Check spam folders after submitting.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-lg font-extrabold">Request received</div>
              <div className="text-sm text-malv-text/70 leading-relaxed">
                If the email matches an account, follow the reset instructions you receive. If nothing arrives, verify the address or
                contact support.
              </div>
              <Button type="button" onClick={() => (window.location.href = "/auth/login")} className="w-full px-6">
                Back to sign in
              </Button>
            </div>
          )}
        </Card>
      </div>
    </MarketingLayout>
  );
}
