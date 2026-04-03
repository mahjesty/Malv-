import { apiFetch, getApiBaseUrl } from "./http";

export type LoginResponse = {
  accessToken: string;
};

export async function login(args: { email: string; password: string; otpCode?: string | null }) {
  return apiFetch<LoginResponse>({
    path: "/v1/auth/login",
    method: "POST",
    body: args,
    skipAuthRefresh: true
  });
}

export async function signup(args: { email: string; password: string; displayName: string }) {
  return apiFetch<LoginResponse & { requiresEmailVerification: boolean }>({
    path: "/v1/auth/signup",
    method: "POST",
    body: args,
    skipAuthRefresh: true
  });
}

export function getOAuthStartUrl(provider: "google" | "github" | "apple"): string {
  const base = getApiBaseUrl();
  const paths: Record<typeof provider, string> = {
    google: "/v1/auth/oauth/google/start",
    github: "/v1/auth/oauth/github/start",
    apple: "/v1/auth/oauth/apple/start"
  };
  return `${base}${paths[provider]}`;
}

export async function forgotPassword(args: { email: string }) {
  return apiFetch<{ ok: true }>({
    path: "/v1/auth/forgot-password",
    method: "POST",
    body: args,
    skipAuthRefresh: true
  });
}

export async function verifyEmail(args: { email?: string | null; otp: string }) {
  return apiFetch<{ ok: true }>({
    path: "/v1/auth/verify-email",
    method: "POST",
    body: { email: args.email ?? undefined, otp: args.otp },
    skipAuthRefresh: true
  });
}

export async function resetPassword(args: { token: string; password: string }) {
  return apiFetch<{ ok: true }>({
    path: "/v1/auth/reset-password",
    method: "POST",
    body: args,
    skipAuthRefresh: true
  });
}

