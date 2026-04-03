import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { SignupDto } from "./dto/signup.dto";
import { LoginDto } from "./dto/login.dto";
import { AuthService } from "./auth.service";
import { RefreshDto } from "./dto/refresh.dto";
import { VerifyEmailDto } from "./dto/verify-email.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator";
import { RateLimitGuard } from "../common/rate-limit/rate-limit.guard";

@Controller("v1/auth")
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cfg: ConfigService
  ) {}

  private refreshCookieName() {
    return this.cfg.get<string>("AUTH_REFRESH_COOKIE_NAME") ?? "malv_refresh";
  }

  private cookieSecure() {
    const explicit = this.cfg.get<string>("AUTH_REFRESH_COOKIE_SECURE");
    if (explicit === "false") return false;
    if (explicit === "true") return true;
    return process.env.NODE_ENV === "production";
  }

  private sameSite(): "lax" | "strict" | "none" {
    const raw = (this.cfg.get<string>("AUTH_REFRESH_COOKIE_SAMESITE") ?? "lax").toLowerCase();
    if (raw === "strict" || raw === "none") return raw;
    return "lax";
  }

  private refreshCookieMaxAgeMs() {
    const ttlSecRaw = this.cfg.get<string>("AUTH_REFRESH_COOKIE_MAX_AGE_SECONDS");
    const ttlSec = Number(ttlSecRaw ?? "");
    if (Number.isFinite(ttlSec) && ttlSec > 0) return Math.floor(ttlSec * 1000);
    const fallback = Number(this.cfg.get<string>("REFRESH_TOKEN_TTL_SECONDS") ?? 1209600);
    return Math.max(60, fallback) * 1000;
  }

  private setRefreshCookie(res: Response, refreshToken: string) {
    res.cookie(this.refreshCookieName(), refreshToken, {
      httpOnly: true,
      secure: this.cookieSecure(),
      sameSite: this.sameSite(),
      path: this.cfg.get<string>("AUTH_REFRESH_COOKIE_PATH") ?? "/",
      domain: this.cfg.get<string>("AUTH_REFRESH_COOKIE_DOMAIN") ?? undefined,
      maxAge: this.refreshCookieMaxAgeMs()
    });
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(this.refreshCookieName(), {
      httpOnly: true,
      secure: this.cookieSecure(),
      sameSite: this.sameSite(),
      path: this.cfg.get<string>("AUTH_REFRESH_COOKIE_PATH") ?? "/",
      domain: this.cfg.get<string>("AUTH_REFRESH_COOKIE_DOMAIN") ?? undefined
    });
  }

  private readCookie(req: Request, key: string): string | null {
    const raw = req.headers.cookie ?? "";
    if (!raw) return null;
    const parts = raw.split(";");
    for (const part of parts) {
      const idx = part.indexOf("=");
      if (idx <= 0) continue;
      const k = part.slice(0, idx).trim();
      if (k !== key) continue;
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
    return null;
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: Request) {
    const auth = (req as any).user as
      | { userId: string; email?: string; displayName?: string; role: string; permissions?: string[] }
      | undefined;
    if (!auth?.userId) return { ok: false, error: "Unauthorized" };
    return {
      ok: true,
      userId: auth.userId,
      email: auth.email ?? null,
      displayName: auth.displayName ?? null,
      role: auth.role,
      permissions: auth.permissions ?? []
    };
  }

  @Post("signup")
  @RateLimit({ key: "auth.signup", limit: 12, windowSeconds: 60 })
  async signup(@Body() dto: SignupDto, @Res({ passthrough: true }) res: Response) {
    const out = await this.auth.signup(dto);
    this.setRefreshCookie(res, out.refreshToken);
    return { accessToken: out.accessToken, requiresEmailVerification: out.requiresEmailVerification };
  }

  @Post("login")
  @RateLimit({ key: "auth.login", limit: 10, windowSeconds: 60 })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const out = await this.auth.login(dto);
    this.setRefreshCookie(res, out.refreshToken);
    return { accessToken: out.accessToken };
  }

  @Post("refresh")
  @RateLimit({ key: "auth.refresh", limit: 30, windowSeconds: 60 })
  async refresh(@Req() req: Request, @Body() _dto: RefreshDto, @Res({ passthrough: true }) res: Response) {
    const tokenFromCookie = this.readCookie(req, this.refreshCookieName());
    const refreshToken = (tokenFromCookie || "").trim();
    const out = await this.auth.refresh({ refreshToken });
    this.setRefreshCookie(res, out.refreshToken);
    return { accessToken: out.accessToken };
  }

  @Post("verify-email")
  @RateLimit({ key: "auth.verify_email", limit: 10, windowSeconds: 300 })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail({ email: dto.email ?? null, otpOrToken: dto.otp });
  }

  @Post("forgot-password")
  @RateLimit({ key: "auth.forgot_password", limit: 5, windowSeconds: 300 })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword({ email: dto.email });
  }

  @Post("reset-password")
  @RateLimit({ key: "auth.reset_password", limit: 8, windowSeconds: 300 })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword({ token: dto.token, password: dto.password });
  }

  @Post("logout")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const tokenFromCookie = this.readCookie(req, this.refreshCookieName());
    await this.auth.logout({ refreshToken: tokenFromCookie });
    this.clearRefreshCookie(res);
    return { ok: true };
  }
}

