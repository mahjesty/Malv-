import { useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Mail, Lock, User, ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface AuthFormProps {
  isLogin: boolean;
  onLogin: (args: { email: string; password: string }) => Promise<void>;
  onRegister: (args: { email: string; password: string; displayName: string }) => Promise<void>;
  error: string | null;
  busy: boolean;
}

export function AuthForm({ isLogin, onLogin, onRegister, error, busy }: AuthFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (isLogin) {
      await onLogin({ email: email.trim(), password });
      return;
    }
    if (password !== confirmPassword) return;
    await onRegister({
      email: email.trim(),
      password,
      displayName: displayName.trim() || email.trim().split("@")[0] || "User"
    });
  };

  const formVariants = {
    hidden: { opacity: 0, x: isLogin ? -20 : 20 },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        duration: 0.4,
        ease: [0.16, 1, 0.3, 1],
        staggerChildren: 0.1
      }
    },
    exit: {
      opacity: 0,
      x: isLogin ? 20 : -20,
      transition: { duration: 0.3 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 }
  };

  const canSubmit = isLogin
    ? email.trim().length > 0 && password.length > 0
    : email.trim().length > 0 && password.length > 0 && password === confirmPassword && displayName.trim().length > 0;

  return (
    <motion.form
      variants={formVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      onSubmit={handleSubmit}
      className="min-w-0 space-y-4 sm:space-y-5"
    >
      {!isLogin && (
        <motion.div variants={itemVariants}>
          <InputField
            icon={<User className="h-4 w-4" />}
            placeholder="Full name"
            type="text"
            name="name"
            value={displayName}
            onChange={(v) => setDisplayName(v)}
            focused={focusedField === "name"}
            onFocus={() => setFocusedField("name")}
            onBlur={() => setFocusedField(null)}
            autoComplete="name"
          />
        </motion.div>
      )}

      <motion.div variants={itemVariants}>
        <InputField
          icon={<Mail className="h-4 w-4" />}
          placeholder="Email address"
          type="email"
          name="email"
          value={email}
          onChange={(v) => setEmail(v)}
          focused={focusedField === "email"}
          onFocus={() => setFocusedField("email")}
          onBlur={() => setFocusedField(null)}
          autoComplete="email"
        />
      </motion.div>

      <motion.div variants={itemVariants}>
        <InputField
          icon={<Lock className="h-4 w-4" />}
          placeholder="Password"
          type={showPassword ? "text" : "password"}
          name="password"
          value={password}
          onChange={(v) => setPassword(v)}
          focused={focusedField === "password"}
          onFocus={() => setFocusedField("password")}
          onBlur={() => setFocusedField(null)}
          autoComplete={isLogin ? "current-password" : "new-password"}
          suffix={
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />
      </motion.div>

      {!isLogin && (
        <motion.div variants={itemVariants}>
          <InputField
            icon={<Lock className="h-4 w-4" />}
            placeholder="Confirm password"
            type={showPassword ? "text" : "password"}
            name="confirmPassword"
            value={confirmPassword}
            onChange={(v) => setConfirmPassword(v)}
            focused={focusedField === "confirmPassword"}
            onFocus={() => setFocusedField("confirmPassword")}
            onBlur={() => setFocusedField(null)}
            autoComplete="new-password"
          />
        </motion.div>
      )}

      {isLogin && (
        <motion.div variants={itemVariants} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm">
          <label className="flex items-center gap-2 cursor-pointer group">
            <div className="relative">
              <input type="checkbox" className="peer sr-only" />
              <div className="h-4 w-4 rounded border border-border bg-secondary/50 peer-checked:bg-primary peer-checked:border-primary transition-all" />
              <svg
                className="absolute inset-0 h-4 w-4 text-primary-foreground opacity-0 peer-checked:opacity-100 transition-opacity"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="text-muted-foreground group-hover:text-foreground transition-colors">Remember me</span>
          </label>
          <a href="/auth/forgot" className="text-primary hover:text-primary/80 transition-colors text-center sm:text-right">
            Forgot password?
          </a>
        </motion.div>
      )}

      {error ? (
        <p className="break-words rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive/90">{error}</p>
      ) : null}

      {!isLogin && password.length > 0 && confirmPassword.length > 0 && password !== confirmPassword ? (
        <p className="text-sm text-destructive/90">Passwords do not match.</p>
      ) : null}

      <motion.div variants={itemVariants}>
        <motion.button
          type="submit"
          disabled={busy || !canSubmit}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className={cn(
            "relative w-full rounded-xl py-3.5 px-4 font-medium text-primary-foreground",
            "bg-gradient-to-r from-primary via-accent to-primary bg-[length:200%_auto]",
            "transition-all duration-500 hover:bg-right",
            "shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30",
            "disabled:opacity-70 disabled:cursor-not-allowed",
            "flex items-center justify-center gap-2 group overflow-hidden"
          )}
        >
          {busy ? (
            <div className="flex items-center gap-2">
              <motion.div
                className="h-5 w-5 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
              <span>Processing...</span>
            </div>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              <span>{isLogin ? "Sign in to malv" : "Create account"}</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </>
          )}

          <motion.div
            className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent"
            animate={{ translateX: ["100%", "-100%"] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
          />
        </motion.button>
      </motion.div>
    </motion.form>
  );
}

interface InputFieldProps {
  icon: React.ReactNode;
  placeholder: string;
  type: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  suffix?: React.ReactNode;
  autoComplete?: string;
}

function InputField({
  icon,
  placeholder,
  type,
  name,
  value,
  onChange,
  focused,
  onFocus,
  onBlur,
  suffix,
  autoComplete
}: InputFieldProps) {
  return (
    <div
      className={cn(
        "relative flex min-w-0 items-center rounded-xl border bg-secondary/30 transition-all duration-300",
        focused ? "border-primary/50 bg-secondary/50 shadow-lg shadow-primary/5" : "border-border/50 hover:border-border"
      )}
    >
      <div className={cn("pointer-events-none absolute left-3.5 sm:left-4 transition-colors duration-300", focused ? "text-primary" : "text-muted-foreground")}>
        {icon}
      </div>
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        autoComplete={autoComplete}
        aria-label={placeholder}
        className={cn(
          "min-h-[44px] min-w-0 flex-1 bg-transparent py-3 pl-10 text-base text-foreground placeholder:text-muted-foreground focus:outline-none sm:pl-11 sm:text-sm",
          suffix ? "pr-2" : "pr-3 sm:pr-4"
        )}
      />
      {suffix ? <div className="shrink-0 pr-2 sm:pr-3">{suffix}</div> : null}
    </div>
  );
}
