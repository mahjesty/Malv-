import { useState } from "react";
import MarketingLayout from "../marketing/MarketingLayout";
import { Card, Button, Input } from "@malv/ui";
import { verifyEmail } from "../../lib/api/auth";
import { parseNestErrorMessage } from "../../lib/api/http-core";

export default function VerifyEmailPage() {
  const [otp, setOtp] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  async function onVerify() {
    setBusy(true);
    setError(null);
    try {
      await verifyEmail({ email: email.trim() || null, otp: otp.trim() });
      setVerified(true);
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
        <div className="text-2xl font-extrabold tracking-tight">Verify your email</div>
        <div className="text-sm text-malv-text/70 mt-2 leading-relaxed">
          Paste the verification token from your email (minimum length enforced server-side). Email is optional but helps catch mismatched
          tokens.
        </div>

        <Card variant="glass" className="p-4 mt-6">
          {!verified ? (
            <div className="space-y-3">
              <div>
                <label htmlFor="verify-email" className="text-sm font-semibold mb-2 block">
                  Email (optional)
                </label>
                <Input id="verify-email" value={email} onChange={setEmail} type="email" placeholder="you@domain.com" />
              </div>
              <div>
                <label htmlFor="verify-token" className="text-sm font-semibold mb-2 block">
                  Verification token
                </label>
                <Input id="verify-token" value={otp} onChange={setOtp} type="text" placeholder="Token from email" />
              </div>
              {error ? <div className="rounded-2xl border border-red-500/20 bg-red-500/10 text-red-200 px-3 py-2 text-sm">{error}</div> : null}
              <Button type="button" onClick={() => void onVerify()} disabled={!otp.trim() || busy} className="w-full px-6">
                {busy ? "Verifying…" : "Verify"}
              </Button>
              <div className="text-xs text-malv-text/55">Invalid or expired tokens return a clear error from the API.</div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-lg font-extrabold">Verified</div>
              <div className="text-sm text-malv-text/70 leading-relaxed">Your email is marked verified for this account.</div>
              <Button type="button" onClick={() => (window.location.href = "/auth/login")} className="w-full px-6">
                Continue to sign in
              </Button>
            </div>
          )}
        </Card>
      </div>
    </MarketingLayout>
  );
}
