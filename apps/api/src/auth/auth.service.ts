import { BadRequestException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { Repository } from "typeorm";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { LoginDto } from "./dto/login.dto";
import { SignupDto } from "./dto/signup.dto";
import { RefreshTokenEntity } from "../db/entities/refresh-token.entity";
import { UserEntity } from "../db/entities/user.entity";
import { RoleEntity, type RoleKey } from "../db/entities/role.entity";
import { UserRoleEntity } from "../db/entities/user-role.entity";
import { SessionEntity } from "../db/entities/session.entity";
import { VerificationTokenEntity, type VerificationTokenType } from "../db/entities/verification-token.entity";
import { ObservabilityService } from "../common/observability.service";

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly refreshMetrics = {
    success: 0,
    invalid: 0,
    expired: 0
  };

  constructor(
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(RefreshTokenEntity) private readonly refreshTokens: Repository<RefreshTokenEntity>,
    @InjectRepository(RoleEntity) private readonly roles: Repository<RoleEntity>,
    @InjectRepository(UserRoleEntity) private readonly userRoles: Repository<UserRoleEntity>,
    @InjectRepository(SessionEntity) private readonly sessions: Repository<SessionEntity>,
    @InjectRepository(VerificationTokenEntity) private readonly verificationTokens: Repository<VerificationTokenEntity>,
    private readonly observability: ObservabilityService
  ) {}

  private randomRefreshToken(): string {
    return crypto.randomBytes(48).toString("base64url");
  }

  private tokenHash(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  private jwtAccessSecret(): string {
    const secret = (this.cfg.get<string>("JWT_ACCESS_SECRET") ?? "").trim();
    if (secret.length < 32) {
      throw new Error("JWT_ACCESS_SECRET must be set and at least 32 characters.");
    }
    const lowered = secret.toLowerCase();
    if (lowered.includes("change-me") || lowered.includes("placeholder")) {
      throw new Error("JWT_ACCESS_SECRET uses an insecure placeholder value.");
    }
    return secret;
  }

  private async issueTokens(user: UserEntity, args?: { trustedDeviceId?: string | null }): Promise<AuthTokens & { refreshExpiresAt: Date }> {
    const role = await this.getPrimaryRoleKey(user.id);
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role },
      {
        secret: this.jwtAccessSecret()
      }
    );

    const refresh = this.randomRefreshToken();
    const expiresSeconds = Number(this.cfg.get<string>("REFRESH_TOKEN_TTL_SECONDS") ?? 1209600);
    const expiresAt = new Date(Date.now() + expiresSeconds * 1000);

    const token = this.refreshTokens.create({
      user,
      tokenHash: this.tokenHash(refresh),
      expiresAt,
      isActive: true
    });
    await this.refreshTokens.save(token);

    // Create/rotate a session that is tied to the refresh token.
    await this.sessions.save(
      this.sessions.create({
        user,
        trustedDevice: args?.trustedDeviceId ? ({ id: args.trustedDeviceId } as any) : null,
        refreshToken: token,
        status: "active",
        ipAddress: null,
        userAgent: null,
        expiresAt,
        lastSeenAt: new Date(),
        revokedAt: null
      })
    );

    return { accessToken, refreshToken: refresh, refreshExpiresAt: expiresAt };
  }

  private async ensureRole(roleKey: RoleKey): Promise<RoleEntity> {
    let role = await this.roles.findOne({ where: { roleKey, isActive: true }, relations: [] });
    if (role) return role;

    role = this.roles.create({ roleKey, roleName: roleKey === "admin" ? "Administrator" : "Standard User", isActive: true });
    await this.roles.save(role);
    return role;
  }

  private async setPrimaryRole(userId: string, roleKey: RoleKey): Promise<void> {
    const role = await this.ensureRole(roleKey);

    // Demote existing primaries.
    await this.userRoles.update({ user: { id: userId }, isPrimary: true }, { isPrimary: false });

    const primary = this.userRoles.create({
      user: { id: userId } as any,
      role,
      isPrimary: true
    });
    await this.userRoles.save(primary);
  }

  private async getPrimaryRoleKey(userId: string): Promise<RoleKey> {
    const primary = await this.userRoles.findOne({
      where: { user: { id: userId }, isPrimary: true },
      relations: ["role"]
    });
    return (primary?.role?.roleKey ?? "user") as RoleKey;
  }

  async signup(dto: SignupDto): Promise<AuthTokens & { requiresEmailVerification: boolean }> {
    const existing = await this.users.findOne({ where: { email: dto.email } });
    if (existing) throw new BadRequestException("Email is already in use.");

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const allowUnverified = (this.cfg.get<string>("DEV_ALLOW_UNVERIFIED") ?? "true") === "true";
    const emailVerified = allowUnverified;

    const user = this.users.create({
      email: dto.email,
      passwordHash,
      displayName: dto.displayName,
      emailVerified,
      isActive: true
    });
    await this.users.save(user);

    await this.setPrimaryRole(user.id, "user");

    if (!emailVerified) {
      // Token-based email verification primitive (actual email sending is integration-only).
      const verifyToken = await this.createVerificationToken({
        userId: user.id,
        tokenType: "email_verification"
      });
      // Dev-only: make the token visible.
      // In production, replace with an email provider integration.
      // eslint-disable-next-line no-console
      console.log(`[MALV] Email verification token for ${dto.email}: ${verifyToken}`);
    }

    const tokens = await this.issueTokens(user);
    this.logger.log(`[MALV auth] signup success userId=${user.id}`);
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, requiresEmailVerification: !emailVerified };
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.users.findOne({ where: { email: dto.email } });
    if (!user || !user.isActive) {
      this.observability.incAuthFailure({ reason: "invalid_credentials", channel: "login" });
      throw new UnauthorizedException("Invalid credentials.");
    }
    if (!user.passwordHash) {
      this.observability.incAuthFailure({ reason: "invalid_credentials", channel: "login" });
      throw new UnauthorizedException("Invalid credentials.");
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      this.observability.incAuthFailure({ reason: "invalid_credentials", channel: "login" });
      throw new UnauthorizedException("Invalid credentials.");
    }

    const allowUnverified = (this.cfg.get<string>("DEV_ALLOW_UNVERIFIED") ?? "true") === "true";
    if (!user.emailVerified && !allowUnverified) {
      this.observability.incAuthFailure({ reason: "email_verification_required", channel: "login" });
      throw new UnauthorizedException("Email verification required.");
    }

    // Trusted-device UX: later we’ll bind a device fingerprint to the refresh token rotation.
    // For now, auth returns tokens; device association will be implemented next.
    const tokens = await this.issueTokens(user);
    this.logger.log(`[MALV auth] login success userId=${user.id}`);
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  async createSessionForUser(user: UserEntity): Promise<AuthTokens> {
    const tokens = await this.issueTokens(user);
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  async registerOAuthUser(args: {
    email: string;
    displayName: string;
    oauthGoogleSub?: string | null;
    oauthAppleSub?: string | null;
    oauthGithubSub?: string | null;
  }): Promise<UserEntity> {
    const existing = await this.users.findOne({ where: { email: args.email } });
    if (existing) throw new BadRequestException("Email is already in use.");

    const user = this.users.create({
      email: args.email,
      displayName: args.displayName,
      passwordHash: null,
      emailVerified: true,
      isActive: true,
      oauthGoogleSub: args.oauthGoogleSub ?? null,
      oauthAppleSub: args.oauthAppleSub ?? null,
      oauthGithubSub: args.oauthGithubSub ?? null
    });
    await this.users.save(user);
    await this.setPrimaryRole(user.id, "user");
    return user;
  }

  async linkOAuthToExistingUser(
    user: UserEntity,
    patch: { oauthGoogleSub?: string | null; oauthAppleSub?: string | null; oauthGithubSub?: string | null }
  ): Promise<UserEntity> {
    if (patch.oauthGoogleSub !== undefined) user.oauthGoogleSub = patch.oauthGoogleSub;
    if (patch.oauthAppleSub !== undefined) user.oauthAppleSub = patch.oauthAppleSub;
    if (patch.oauthGithubSub !== undefined) user.oauthGithubSub = patch.oauthGithubSub;
    user.emailVerified = true;
    await this.users.save(user);
    return user;
  }

  private async createVerificationToken(args: { userId: string; tokenType: VerificationTokenType }): Promise<string> {
    const raw = crypto.randomBytes(24).toString("base64url");
    const tokenHash = this.tokenHash(raw);
    const ttlSeconds =
      Number(this.cfg.get<string>("VERIFICATION_TOKEN_TTL_SECONDS") ?? 3600) || 3600;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await this.verificationTokens.save(
      this.verificationTokens.create({
        userId: args.userId,
        tokenType: args.tokenType,
        tokenHash,
        expiresAt,
        consumedAt: undefined
      })
    );
    return raw;
  }

  async verifyEmail(args: { email?: string | null; otpOrToken: string }): Promise<{ ok: true }> {
    const hash = this.tokenHash(args.otpOrToken);
    const user = args.email ? await this.users.findOne({ where: { email: args.email } }) : null;

    const token = await this.verificationTokens.findOne({
      where: {
        tokenHash: hash,
        tokenType: "email_verification"
      }
    });
    if (!token || token.expiresAt.getTime() < Date.now()) throw new BadRequestException("Invalid or expired verification token.");
    if (token.consumedAt) throw new BadRequestException("Verification token already consumed.");
    if (user && user.id !== token.userId) throw new BadRequestException("Verification token does not match this email.");

    const targetUser = user ?? (await this.users.findOne({ where: { id: token.userId } }));
    if (!targetUser) throw new BadRequestException("Invalid verification token.");

    targetUser.emailVerified = true;
    await this.users.save(targetUser);

    token.consumedAt = new Date();
    await this.verificationTokens.save(token);
    return { ok: true };
  }

  async forgotPassword(args: { email: string }): Promise<{ ok: true }> {
    const user = await this.users.findOne({ where: { email: args.email } });
    if (!user) {
      // Do not leak account existence.
      return { ok: true };
    }

    const resetToken = await this.createVerificationToken({
      userId: user.id,
      tokenType: "password_reset"
    });
    // eslint-disable-next-line no-console
    console.log(`[MALV] Password reset token for ${args.email}: ${resetToken}`);
    return { ok: true };
  }

  async resetPassword(args: { token: string; password: string }): Promise<{ ok: true }> {
    const tokenHash = this.tokenHash(args.token);
    const token = await this.verificationTokens.findOne({
      where: { tokenHash, tokenType: "password_reset" }
    });

    if (!token || token.expiresAt.getTime() < Date.now()) throw new BadRequestException("Invalid or expired reset token.");
    if (token.consumedAt) throw new BadRequestException("Reset token already consumed.");

    const user = await this.users.findOne({ where: { id: token.userId } });
    if (!user) throw new BadRequestException("Invalid reset token.");

    user.passwordHash = await bcrypt.hash(args.password, 12);
    await this.users.save(user);

    // Security hardening: revoke all active sessions/tokens after password reset.
    const now = new Date();
    await this.refreshTokens.update({ user: { id: user.id }, isActive: true } as any, { isActive: false } as any);
    await this.sessions.update(
      { user: { id: user.id }, status: "active" } as any,
      { status: "revoked", revokedAt: now, lastSeenAt: now } as any
    );

    token.consumedAt = new Date();
    await this.verificationTokens.save(token);
    return { ok: true };
  }

  async refresh(args: { refreshToken: string }): Promise<AuthTokens> {
    const tokenHash = this.tokenHash(args.refreshToken);
    const refresh = await this.refreshTokens.findOne({ where: { tokenHash }, relations: ["user"] });

    if (!refresh) {
      this.observability.incAuthFailure({ reason: "invalid_token", channel: "refresh" });
      this.refreshMetrics.invalid += 1;
      this.logger.warn(
        JSON.stringify({
          tag: "auth.refresh.failed",
          reason: "invalid_token",
          metrics: this.refreshMetrics
        })
      );
      throw new UnauthorizedException("Invalid refresh token.");
    }
    if (!refresh.isActive || refresh.expiresAt.getTime() < Date.now()) {
      this.observability.incAuthFailure({ reason: "expired_token", channel: "refresh" });
      this.refreshMetrics.expired += 1;
      this.logger.warn(
        JSON.stringify({
          tag: "auth.refresh.failed",
          reason: "expired_token",
          userId: refresh.user?.id ?? "unknown",
          metrics: this.refreshMetrics
        })
      );
      throw new UnauthorizedException("Refresh token expired.");
    }

    const rotate = await this.refreshTokens.update({ id: refresh.id, isActive: true } as any, { isActive: false } as any);
    if (!rotate.affected) {
      this.observability.incAuthFailure({ reason: "refresh_replay_detected", channel: "refresh" });
      throw new UnauthorizedException("Refresh token already used.");
    }
    await this.sessions.update({ refreshToken: { id: refresh.id }, status: "active" } as any, { status: "revoked", revokedAt: new Date() } as any);

    // Issue new tokens and a new session.
    const tokens = await this.issueTokens(refresh.user);
    this.refreshMetrics.success += 1;
    this.logger.log(`[MALV auth] refresh success userId=${refresh.user.id}`);
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  async logout(args: { refreshToken: string | null; revokeAll?: boolean }) {
    const now = new Date();
    if (args.revokeAll && args.refreshToken) {
      const existing = await this.refreshTokens.findOne({ where: { tokenHash: this.tokenHash(args.refreshToken) }, relations: ["user"] });
      if (existing?.user?.id) {
        await this.refreshTokens.update({ user: { id: existing.user.id }, isActive: true } as any, { isActive: false } as any);
        await this.sessions.update({ user: { id: existing.user.id }, status: "active" } as any, { status: "revoked", revokedAt: now } as any);
      }
      return;
    }
    if (!args.refreshToken) return;
    const tokenHash = this.tokenHash(args.refreshToken);
    await this.refreshTokens.update({ tokenHash, isActive: true } as any, { isActive: false } as any);
    await this.sessions.update({ refreshToken: { tokenHash }, status: "active" } as any, { status: "revoked", revokedAt: now } as any);
  }
}

