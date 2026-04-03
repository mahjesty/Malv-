import { createContext, useContext } from "react";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export type AuthContextValue = {
  status: AuthStatus;
  accessToken: string | null;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  role: string | null;
  permissions: string[];
  logout: (reason?: string) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export { AuthContext };

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
