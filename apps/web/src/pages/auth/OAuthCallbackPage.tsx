import { useEffect, useState } from "react";

/**
 * OAuth providers redirect here after backend sets HttpOnly cookie.
 */
export default function OAuthCallbackPage() {
  const [message, setMessage] = useState("Completing sign-in…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      setMessage(`Sign-in was not completed (${err}).`);
      return;
    }

    if (params.get("status") === "ok") {
      window.location.replace("/app");
      return;
    }

    setMessage("Sign-in completed, but session bootstrap did not finish. Try signing in again.");
  }, []);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background text-foreground px-6">
      <p className="text-sm text-muted-foreground text-center max-w-sm">{message}</p>
    </div>
  );
}
