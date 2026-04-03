import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AuthForm } from "@/components/auth/auth-form";
import { NeuralBackground } from "@/components/auth/neural-background";
import { FloatingElements } from "@/components/auth/floating-elements";
import { BrainIcon } from "@/components/auth/brain-icon";
import { login, signup, getOAuthStartUrl } from "@/lib/api/auth";
import { setStoredSession } from "@/lib/auth/session";

type Mode = "login" | "signup";

export function AuthNeuralPage({ initialMode }: { initialMode: Mode }) {
  const [isLogin, setIsLogin] = useState(initialMode === "login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLogin(initialMode === "login");
  }, [initialMode]);

  async function handleLogin(args: { email: string; password: string }) {
    setError(null);
    setBusy(true);
    try {
      const res = await login(args);
      setStoredSession({ accessToken: res.accessToken });
      window.location.href = "/app";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister(args: { email: string; password: string; displayName: string }) {
    setError(null);
    setBusy(true);
    try {
      const res = await signup(args);
      setStoredSession({ accessToken: res.accessToken });
      window.location.href = "/app";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signup failed");
    } finally {
      setBusy(false);
    }
  }

  function startOAuth(provider: "google" | "apple" | "github") {
    window.location.assign(getOAuthStartUrl(provider));
  }

  return (
    <main className="auth-page landing-v0 dark relative flex min-h-[100dvh] w-full max-w-[100vw] flex-col overflow-x-clip overflow-y-auto bg-background [-webkit-overflow-scrolling:touch]">
      <NeuralBackground />
      <div className="pointer-events-none absolute inset-0 hidden overflow-hidden sm:block">
        <FloatingElements />
      </div>

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,200,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,200,255,0.03)_1px,transparent_1px)] bg-[size:60px_60px] animate-grid-move opacity-40" />

      <div className="relative z-10 mx-auto flex w-full min-w-0 max-w-lg flex-1 flex-col items-center justify-start gap-6 px-4 py-6 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:justify-center sm:gap-8 sm:py-10">
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="flex w-full max-w-md shrink-0 flex-col items-center gap-3 sm:mb-0 sm:gap-4"
        >
          <div className="relative">
            <BrainIcon className="h-14 w-14 sm:h-16 sm:w-16 text-primary" />
            <div className="absolute inset-0 blur-xl bg-primary/30 rounded-full animate-pulse-glow" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight md:text-5xl text-center">
            <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent bg-[length:200%_auto] animate-auth-gradient">
              malv
            </span>
          </h1>
          <p className="text-muted-foreground text-center max-w-sm text-balance text-sm sm:text-base px-1">
            The AI platform for building transformative experiences
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-[min(100%,28rem)]"
        >
          <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 blur-xl opacity-75" />

          <div className="relative rounded-2xl border border-border/50 bg-card/80 backdrop-blur-xl p-5 sm:p-8 shadow-2xl">
            <div className="mb-6 flex min-w-0 rounded-xl bg-muted/50 p-1 sm:mb-8">
              <TabButton active={isLogin} onClick={() => setIsLogin(true)} label="Sign In" />
              <TabButton active={!isLogin} onClick={() => setIsLogin(false)} label="Register" />
            </div>

            <AnimatePresence mode="wait">
              <AuthForm
                key={isLogin ? "login" : "register"}
                isLogin={isLogin}
                onLogin={handleLogin}
                onRegister={handleRegister}
                error={error}
                busy={busy}
              />
            </AnimatePresence>

            <div className="mt-6 sm:mt-8">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border/50" />
                </div>
                <div className="relative flex justify-center text-xs uppercase tracking-wide">
                  <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-1.5 sm:mt-6 sm:gap-3">
                <SocialButton icon="google" label="Google" onClick={() => startOAuth("google")} />
                <SocialButton icon="apple" label="Apple" onClick={() => startOAuth("apple")} />
                <SocialButton icon="github" label="GitHub" onClick={() => startOAuth("github")} />
              </div>
            </div>
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-6 sm:mt-8 text-center text-xs text-muted-foreground max-w-md px-2"
        >
          By continuing, you agree to our{" "}
          <a href="/terms" className="text-primary hover:underline">
            Terms
          </a>{" "}
          and{" "}
          <a href="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </a>
        </motion.p>
      </div>
    </main>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative min-h-[44px] min-w-0 flex-1 rounded-lg px-2 py-2.5 text-sm font-medium transition-colors duration-200 touch-manipulation sm:px-4 ${
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground/80"
      }`}
    >
      {active && (
        <motion.div
          layoutId="activeTab"
          className="absolute inset-0 rounded-lg bg-secondary"
          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
        />
      )}
      <span className="relative z-10 truncate">{label}</span>
    </button>
  );
}

function SocialButton({
  icon,
  onClick,
  label
}: {
  icon: "google" | "github" | "apple";
  onClick: () => void;
  label: string;
}) {
  const icons = {
    google: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
        <path
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          fill="#4285F4"
        />
        <path
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          fill="#34A853"
        />
        <path
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          fill="#FBBC05"
        />
        <path
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          fill="#EA4335"
        />
      </svg>
    ),
    github: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
      </svg>
    ),
    apple: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
        <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.312-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z" />
      </svg>
    )
  };

  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      aria-label={label}
      className="flex min-h-[44px] w-full min-w-0 items-center justify-center rounded-xl border border-border/50 bg-secondary/50 p-2 transition-colors hover:bg-secondary hover:border-primary/30 touch-manipulation sm:min-h-[48px] sm:p-3"
    >
      {icons[icon]}
    </motion.button>
  );
}
