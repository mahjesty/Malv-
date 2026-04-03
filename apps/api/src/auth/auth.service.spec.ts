import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";

describe("AuthService security hardening", () => {
  it("revokes active refresh tokens and sessions on password reset", async () => {
    const user = { id: "u1", passwordHash: "old-hash" } as any;
    const token = {
      userId: "u1",
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null
    } as any;
    const users: any = {
      findOne: jest.fn().mockResolvedValue(user),
      save: jest.fn().mockResolvedValue(user)
    };
    const verificationTokens: any = {
      findOne: jest.fn().mockResolvedValue(token),
      save: jest.fn().mockResolvedValue({ ...token, consumedAt: new Date() })
    };
    const refreshTokens: any = {
      update: jest.fn().mockResolvedValue({ affected: 2 })
    };
    const sessions: any = {
      update: jest.fn().mockResolvedValue({ affected: 2 }),
      save: jest.fn()
    };
    const svc = new AuthService(
      {} as JwtService,
      { get: jest.fn() } as unknown as ConfigService,
      users,
      refreshTokens,
      {} as any,
      {} as any,
      sessions,
      verificationTokens,
      { incAuthFailure: jest.fn() } as any
    );
    (svc as any).tokenHash = jest.fn().mockReturnValue("hashed-reset-token");

    const out = await svc.resetPassword({ token: "raw-reset-token", password: "NewPassw0rd!" });
    expect(out.ok).toBe(true);
    expect(refreshTokens.update).toHaveBeenCalledWith(
      { user: { id: "u1" }, isActive: true },
      { isActive: false }
    );
    expect(sessions.update).toHaveBeenCalled();
    expect(verificationTokens.save).toHaveBeenCalled();
  });

  it("rotates refresh tokens and revokes used token", async () => {
    const user = { id: "u1", isActive: true } as any;
    const refreshRow = {
      id: "rt-1",
      user,
      tokenHash: "old",
      isActive: true,
      expiresAt: new Date(Date.now() + 60_000)
    } as any;
    const refreshTokens: any = {
      findOne: jest.fn().mockResolvedValue(refreshRow),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn((v) => v),
      save: jest.fn().mockResolvedValue({})
    };
    const svc = new AuthService(
      { signAsync: jest.fn().mockResolvedValue("access") } as any,
      { get: jest.fn((k: string) => (k === "REFRESH_TOKEN_TTL_SECONDS" ? "3600" : "super-secure-test-secret-abcdefghijklmnopqrstuvwxyz")) } as unknown as ConfigService,
      {} as any,
      refreshTokens,
      {} as any,
      {} as any,
      { create: jest.fn((v) => v), save: jest.fn(), update: jest.fn() } as any,
      { findOne: jest.fn() } as any,
      { incAuthFailure: jest.fn() } as any
    );
    (svc as any).tokenHash = jest.fn().mockReturnValue("hashed");
    (svc as any).randomRefreshToken = jest.fn().mockReturnValue("new-refresh");
    (svc as any).getPrimaryRoleKey = jest.fn().mockResolvedValue("user");
    const out = await svc.refresh({ refreshToken: "raw" });
    expect(out.accessToken).toBe("access");
    expect(out.refreshToken).toBe("new-refresh");
    expect(refreshTokens.update).toHaveBeenCalledWith({ id: "rt-1", isActive: true }, { isActive: false });
  });

  it("revokes only current token on logout", async () => {
    const refreshTokens: any = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    const sessions: any = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    const svc = new AuthService(
      {} as any,
      { get: jest.fn() } as any,
      {} as any,
      refreshTokens,
      {} as any,
      {} as any,
      sessions,
      {} as any,
      { incAuthFailure: jest.fn() } as any
    );
    (svc as any).tokenHash = jest.fn().mockReturnValue("h");
    await svc.logout({ refreshToken: "raw" });
    expect(refreshTokens.update).toHaveBeenCalledWith({ tokenHash: "h", isActive: true }, { isActive: false });
    expect(sessions.update).toHaveBeenCalled();
  });
});
