import { OAuthService } from "./oauth.service";

describe("OAuthService redirect hardening", () => {
  it("does not leak tokens into redirect URL", () => {
    const svc = new OAuthService(
      {
        get: jest.fn((k: string) => {
          if (k === "WEB_ORIGIN") return "https://app.example.com";
          if (k === "AUTH_REFRESH_COOKIE_SECURE") return "true";
          if (k === "AUTH_REFRESH_COOKIE_SAMESITE") return "lax";
          if (k === "AUTH_REFRESH_COOKIE_MAX_AGE_SECONDS") return "3600";
          return null;
        })
      } as any,
      {} as any,
      {} as any,
      {} as any
    );
    const res: any = { cookie: jest.fn(), redirect: jest.fn() };
    svc.redirectSuccess(res, { accessToken: "a", refreshToken: "r" });
    const redirectUrl = res.redirect.mock.calls[0][1] as string;
    expect(redirectUrl).toContain("/auth/oauth/callback?status=ok");
    expect(redirectUrl).not.toContain("access_token");
    expect(redirectUrl).not.toContain("refresh_token");
  });
});
